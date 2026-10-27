const { Interaction, Match, Conversation, Message } = require('../models');
console.log('🔎 Modelos válidos no Sequelize:', Object.keys(require('../models')));
const { Op } = require('sequelize'); // Importante para o Op.or

// ─── Função atualizada com a lógica de conversação ──────────────────────────
const checkMatch = async (userA, userB) => {
  const interactionBack = await Interaction.findOne({
    where: { from_user_id: userB, to_user_id: userA, type: 'like' }
  });

  if (interactionBack) {
    const existingMatch = await Match.findOne({
      where: {
        [Op.or]: [
          { user1_id: userA, user2_id: userB },
          { user1_id: userB, user2_id: userA }
        ]
      }
    });

   if (!existingMatch) {
      // 1. Cria o Match
      const newMatch = await Match.create({ user1_id: userA, user2_id: userB });
      
      // 2. Cria a Conversa ligada a esse Match exato (agora usando match_id)
      await Conversation.create({
        match_id: newMatch.id // Usando a coluna correta que está no seu modelo!
      });
      
      console.log(`🔥 MATCH REAL & CONVERSA PRONTA: ${userA} & ${userB}`);
    }
    return true; 
  }
  return null;
};

// ─── As funções abaixo que você perguntou: ──────────────────────────────────

const curtirPerfil = async (req, res) => {
  const from_user_id = req.user.id;
  const to_user_id = req.params.usuarioId;

  try {
    if (from_user_id === to_user_id) {
      return res.status(400).json({ message: "Você não pode curtir a si mesmo." });
    }

    const jaCurtiu = await Interaction.findOne({
      where: { from_user_id, to_user_id, type: 'like' }
    });

    if (jaCurtiu) {
      return res.status(400).json({ message: "Você já curtiu este perfil." });
    }

    await Interaction.create({
      from_user_id,
      to_user_id,
      type: 'like'
    });

    const matchResult = await checkMatch(from_user_id, to_user_id);

    return res.status(201).json({
        message: "Interação registrada!",
        match: !!matchResult,
        data: matchResult
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
    if (from_user_id === to_user_id) {
      return res.status(400).json({ message: "Você não pode passar a si mesmo." });
    }

    await Interaction.create({
      from_user_id,
      to_user_id,
      type: 'pass'
    });

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