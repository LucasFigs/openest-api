const db = require('../models');
const { Interaction, Match, Conversation, Message, User } = db;
const { Op } = require('sequelize'); // Importante para o Op.or
const { notifyNewMatch } = require('../services/notificationService'); // T048 — aviso de novo match

// IDs de usuário são UUID: qualquer outra coisa é 400 (antes virava 500 no banco).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

// Valida o alvo de uma interação. Devolve { status, body } quando é inválido.
const validarAlvo = async (from_user_id, to_user_id, { acao }) => {
  if (!isUuid(to_user_id)) {
    return { status: 400, body: { message: "Identificador de usuário inválido." } };
  }
  if (from_user_id === to_user_id) {
    return { status: 400, body: { message: `Você não pode ${acao} a si mesmo.` } };
  }
  const alvo = await User.findByPk(to_user_id, { attributes: ['id'] });
  if (!alvo) {
    return { status: 404, body: { message: "Usuário não encontrado." } };
  }
  return null;
};

// Serializa tudo o que acontece entre DOIS usuários (curtir, passar, criar
// match) numa transação com trava do Postgres para o par. Sem isso, toques
// duplos gravavam várias linhas iguais e duas curtidas simultâneas (A→B e
// B→A) criavam DOIS matches e DUAS conversas.
const comTravaDoPar = (userA, userB, fn) =>
  db.sequelize.transaction(async (transaction) => {
    const chave = [String(userA), String(userB)].sort().join(':');
    await db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:chave))', {
      replacements: { chave },
      transaction,
    });
    return fn(transaction);
  });

// Match entre userA e userB, se a curtida for recíproca. Roda dentro da trava
// do par. Devolve { isMatch, novo } — `novo` traz o match/conversa recém-criados
// (para avisar os dois usuários só DEPOIS do commit).
const checkMatch = async (userA, userB, transaction) => {
  const interactionBack = await Interaction.findOne({
    where: { from_user_id: userB, to_user_id: userA, type: 'like' },
    transaction,
  });
  if (!interactionBack) return { isMatch: false, novo: null };

  const existingMatch = await Match.findOne({
    where: {
      [Op.or]: [
        { user1_id: userA, user2_id: userB },
        { user1_id: userB, user2_id: userA }
      ]
    },
    transaction,
  });
  if (existingMatch) return { isMatch: true, novo: null };

  // Match + a conversa ligada a ele (coluna match_id).
  const newMatch = await Match.create({ user1_id: userA, user2_id: userB }, { transaction });
  const conversation = await Conversation.create({ match_id: newMatch.id }, { transaction });
  console.log(`🔥 MATCH REAL & CONVERSA PRONTA: ${userA} & ${userB}`);
  return { isMatch: true, novo: { matchId: newMatch.id, conversationId: conversation.id } };
};

// T048 — socket `new_match` para os dois + push para quem foi curtido.
// Sem await: o push roda em segundo plano e nunca quebra a curtida.
const avisarNovoMatch = (req, novo, likerId, likedId) => {
  if (!novo) return;
  notifyNewMatch({
    io: req.app.get('socketio'),
    matchId: novo.matchId,
    conversationId: novo.conversationId,
    likerId,
    likedId,
  });
};

const curtirPerfil = async (req, res) => {
  const from_user_id = req.user.id;
  const to_user_id = req.params.usuarioId;

  try {
    const invalido = await validarAlvo(from_user_id, to_user_id, { acao: 'curtir' });
    if (invalido) return res.status(invalido.status).json(invalido.body);

    const resultado = await comTravaDoPar(from_user_id, to_user_id, async (transaction) => {
      const jaCurtiu = await Interaction.findOne({
        where: { from_user_id, to_user_id, type: 'like' },
        transaction,
      });
      // Idempotente: repetir a curtida (retry de rede, toque duplo, baralho
      // desatualizado) não é erro e não grava outra linha. checkMatch ainda
      // cria o match se a 1ª tentativa tiver caído no meio.
      if (!jaCurtiu) {
        await Interaction.create({ from_user_id, to_user_id, type: 'like' }, { transaction });
      }
      const match = await checkMatch(from_user_id, to_user_id, transaction);
      return { jaCurtiu: Boolean(jaCurtiu), ...match };
    });

    avisarNovoMatch(req, resultado.novo, from_user_id, to_user_id);

    if (resultado.jaCurtiu) {
      return res.status(200).json({
        message: "Você já curtiu este perfil.",
        ja_curtiu: true,
        match: resultado.isMatch,
        data: resultado.isMatch || null
      });
    }
    return res.status(201).json({
      message: "Interação registrada!",
      match: resultado.isMatch,
      data: resultado.isMatch || null
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao processar curtida." });
  }
};

const passarPerfil = async (req, res) => {
  const from_user_id = req.user.id;
  const to_user_id = req.params.usuarioId;

  try {
    const invalido = await validarAlvo(from_user_id, to_user_id, { acao: 'passar' });
    if (invalido) return res.status(invalido.status).json(invalido.body);

    const jaPassou = await comTravaDoPar(from_user_id, to_user_id, async (transaction) => {
      // Idempotente: um "passar" repetido não duplica a linha.
      const existente = await Interaction.findOne({
        where: { from_user_id, to_user_id, type: 'pass' },
        transaction,
      });
      if (existente) return true;
      await Interaction.create({ from_user_id, to_user_id, type: 'pass' }, { transaction });
      return false;
    });

    if (jaPassou) {
      return res.status(200).json({ message: "Perfil já passado.", ja_passou: true, match: false });
    }
    return res.status(201).json({
      message: "Interação registrada (pass)!",
      match: false
    });

  } catch (error) {
    console.error("Erro na T035:", error);
    return res.status(500).json({ error: "Erro ao processar 'passar'." });
  }
};

// ─── T034 — Desfazer (undo) da última interação ─────────────────────────────
// Remove o último like/pass registrado por mim contra um perfil. Se a
// interação desfeita era um 'like' e originou um match, o match (e a conversa
// vazia vinculada) também é removido — nunca apagamos conversas com mensagens,
// para não destruir histórico do usuário.
const desfazerInteracao = async (req, res) => {
  const from_user_id = req.user.id;
  const to_user_id = req.params.usuarioId;

  try {
    if (!isUuid(to_user_id)) {
      return res.status(400).json({ message: "Identificador de usuário inválido." });
    }
    if (from_user_id === to_user_id) {
      return res.status(400).json({ message: "Você não pode desfazer uma interação consigo mesmo." });
    }

    // Última interação registrada por mim contra esse perfil (like ou pass).
    const ultima = await Interaction.findOne({
      where: { from_user_id, to_user_id },
      order: [['created_at', 'DESC']],
    });

    if (!ultima) {
      return res.status(404).json({ message: "Nenhuma interação para desfazer." });
    }

    const tipo = ultima.type;
    await ultima.destroy();

    let match_removido = false;
    if (tipo === 'like') {
      const match = await Match.findOne({
        where: {
          [Op.or]: [
            { user1_id: from_user_id, user2_id: to_user_id },
            { user1_id: to_user_id, user2_id: from_user_id },
          ]
        }
      });

      if (match) {
        const conversa = await Conversation.findOne({ where: { match_id: match.id } });
        const temMensagens = conversa
          ? await Message.count({ where: { conversation_id: conversa.id } })
          : 0;

        // Só remove o match se a conversa (quando existe) estiver vazia.
        if (!conversa || temMensagens === 0) {
          if (conversa) await conversa.destroy();
          await match.destroy();
          match_removido = true;
        }
      }
    }

    return res.status(200).json({
      message: "Interação desfeita!",
      tipo,
      match_removido,
    });

  } catch (error) {
    console.error("Erro na T034 (desfazer):", error);
    return res.status(500).json({ error: "Erro ao desfazer a interação." });
  }
};

module.exports = { curtirPerfil, passarPerfil, desfazerInteracao };