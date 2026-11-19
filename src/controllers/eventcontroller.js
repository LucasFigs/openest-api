const db = require('../models');
const { Match, User, Conversation } = db;
const { Op } = require('sequelize');
const { resolverOutroParticipante, mesclarEncontros } = require('../utils/eventos');

const meusEncontros = async (req, res) => {
  try {
    const userId = req.user.id;
    const { mes, ano } = req.query;

    let dateFilter = {};
    let inicioStr, fimStr;

    // Filtro rigoroso por Mês e Ano
    if (mes && ano) {
      const inicio = new Date(parseInt(ano), parseInt(mes) - 1, 1);
      const fim    = new Date(parseInt(ano), parseInt(mes), 1);
      dateFilter = { created_at: { [Op.gte]: inicio, [Op.lt]: fim } };
      inicioStr = inicio.toISOString();
      fimStr = fim.toISOString();
    }

    const matches = await Match.findAll({
      where: { [Op.or]: [{ user1_id: userId }, { user2_id: userId }], ...dateFilter },
      order: [['created_at', 'DESC']],
    });

    const eventosDeMatch = await Promise.all(matches.map(async (match) => {
      const outroUserId = match.user1_id === userId ? match.user2_id : match.user1_id;
      const outroUser   = await User.findByPk(outroUserId, { attributes: ['id', 'name', 'foto_url', 'bio'] });
      const conversa = await Conversation.findOne({ where: { match_id: match.id }, attributes: ['id'] });
      return {
        id: `match-${match.id}`, titulo: `Encontro com ${outroUser?.name || 'Usuário'}`,
        data_encontro: match.created_at, local: 'A combinar via chat', matchId: conversa?.id || null,
        matchName: outroUser?.name || 'Usuário', fotos: outroUser?.foto_url ? [outroUser.foto_url] : [],
        bio: outroUser?.bio || '', tipo: 'match',
        otherUserId: outroUserId ? String(outroUserId) : null, // chave de deduplicação
      };
    }));

    let eventosAgendados = [];
    try {
      let schedQuery = `
        SELECT se.*
        FROM scheduled_events se
        WHERE (se.created_by = :userId OR se.other_user_id = :userId)
      `;
      const replacements = { userId };

      // Aplica o filtro de datas também aos encontros do chat!
      if (mes && ano) {
        schedQuery += ` AND se.scheduled_at >= :inicio AND se.scheduled_at < :fim`;
        replacements.inicio = inicioStr;
        replacements.fim = fimStr;
      }

      schedQuery += ` ORDER BY se.scheduled_at ASC`;

      const rows = await db.sequelize.query(schedQuery, {
        replacements,
        type: db.sequelize.QueryTypes.SELECT
      });

      eventosAgendados = await Promise.all((rows || []).map(async (e) => {
        // 🔑 Resolve SEMPRE o OUTRO participante (nunca o próprio usuário logado):
        // o criador do convite vê o convidado; o convidado vê o criador.
        const outroUserId = resolverOutroParticipante(e, userId);
        const outroUser = await User.findByPk(outroUserId, { attributes: ['id', 'name', 'foto_url', 'bio'] });
        return {
          id: `sched-${e.id}`, titulo: e.titulo || `Encontro com ${outroUser?.name || 'Usuário'}`,
          data_encontro: e.scheduled_at, local: e.local || 'A combinar', matchId: e.conversation_id || null,
          matchName: outroUser?.name || 'Usuário', fotos: outroUser?.foto_url ? [outroUser.foto_url] : [],
          bio: outroUser?.bio || '', tipo: 'agendado', nota: e.nota || '',
          otherUserId: outroUserId ? String(outroUserId) : null,
        };
      }));
    } catch (_) {}

    // 🔒 Deduplicação por par de usuários: cada pessoa aparece UMA única vez.
    // Um encontro AGENDADO substitui o card "A combinar" (match) do mesmo par.
    const resultado = mesclarEncontros(eventosDeMatch, eventosAgendados);
    return res.status(200).json(resultado);
  } catch (error) { return res.status(500).json({ error: 'Erro interno ao buscar eventos.' }); }
};

const criarEncontro = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversation_id, other_user_id, titulo, scheduled_at, local, nota } = req.body;
    if (!conversation_id || !other_user_id || !scheduled_at) return res.status(400).json({ error: 'Faltam dados obrigatórios.' });

    await db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS scheduled_events (
        id SERIAL PRIMARY KEY, created_by UUID NOT NULL, other_user_id UUID NOT NULL,
        conversation_id INTEGER, titulo VARCHAR(255), scheduled_at TIMESTAMPTZ NOT NULL,
        local VARCHAR(255), nota TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 🔒 Trava anti-duplicação: um par de usuários tem no máximo UM encontro
    // agendado ativo. Antes de inserir, remove qualquer agendamento anterior
    // entre as mesmas duas pessoas (em qualquer direção) — isso evita cards
    // duplicados caso o convite seja aceito/reenviado mais de uma vez.
    await db.sequelize.query(
      `DELETE FROM scheduled_events
        WHERE (created_by = :userId AND other_user_id = :other_user_id)
           OR (created_by = :other_user_id AND other_user_id = :userId)`,
      {
        replacements: { userId, other_user_id },
        type: db.sequelize.QueryTypes.DELETE,
      }
    );

    const [result] = await db.sequelize.query(
      `INSERT INTO scheduled_events (created_by, other_user_id, conversation_id, titulo, scheduled_at, local, nota)
       VALUES (:userId, :other_user_id, :conversation_id, :titulo, :scheduled_at, :local, :nota) RETURNING *`,
      {
        replacements: { userId, other_user_id, conversation_id, titulo: titulo || 'Encontro pelo Openest', scheduled_at: new Date(scheduled_at), local: local || 'A combinar', nota: nota || '' },
        type: db.sequelize.QueryTypes.INSERT,
      }
    );

    const outroUser = await User.findByPk(other_user_id, { attributes: ['name', 'foto_url'] });
    return res.status(201).json({
      id: `sched-${result[0]?.id}`, titulo: result[0]?.titulo, data_encontro: result[0]?.scheduled_at,
      local: result[0]?.local, matchId: conversation_id, matchName: outroUser?.name || 'Usuário',
      fotos: outroUser?.foto_url ? [outroUser.foto_url] : [], bio: '', tipo: 'agendado', nota: result[0]?.nota
    });
  } catch (error) { return res.status(500).json({ error: 'Erro interno ao criar evento.' }); }
};

// "Desistir" de um encontro.
//
// A tela de Encontros mostra DOIS tipos de card para a mesma pessoa:
//   • "Agendado"   → linha em scheduled_events
//   • "A combinar" → só o Match, sem evento marcado
// Desistir precisa encerrar o VÍNCULO inteiro (evento + match). Se apagasse
// só o evento, o card voltava no refresh como "A combinar"; e se o card era
// "A combinar", não havia evento nenhum para apagar.
//
// Aceita o id em qualquer formato: 'sched-<n>', 'match-<uuid>', ou os ids
// crus ('3' / '<uuid>') que o mobile enviava sem o prefixo — antes isso caía
// fora dos dois `if` e a rota respondia 200 sem apagar nada (falha silenciosa).
async function resolverVinculo(rawId, userId, body = {}) {
  const id = String(rawId == null ? '' : rawId).trim();
  const semPrefixo = id.replace(/^(sched|match)-/, '');
  const pedeMatch = id.startsWith('match-');
  const pedeSched = id.startsWith('sched-') || (!pedeMatch && /^\d+$/.test(semPrefixo));

  // 1) Encontro agendado → descobre o par pelo próprio evento.
  if (pedeSched && semPrefixo) {
    const eventId = parseInt(semPrefixo, 10);
    if (Number.isInteger(eventId)) {
      const rows = await db.sequelize.query(
        `SELECT created_by, other_user_id FROM scheduled_events
          WHERE id = :eventId AND (created_by = :userId OR other_user_id = :userId)`,
        { replacements: { eventId, userId }, type: db.sequelize.QueryTypes.SELECT }
      );
      if (rows && rows.length) {
        const ev = rows[0];
        const otherUserId = String(ev.created_by) === String(userId) ? ev.other_user_id : ev.created_by;
        return { otherUserId };
      }
    }
  }

  // 2) Match → descobre o par pelo match.
  if (!pedeSched && semPrefixo) {
    const match = await Match.findOne({
      where: {
        id: semPrefixo,
        [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
      },
    });
    if (match) {
      const otherUserId = String(match.user1_id) === String(userId) ? match.user2_id : match.user1_id;
      return { otherUserId };
    }
  }

  // 3) Último recurso: o cliente pode mandar com quem é o encontro.
  const hint = body.other_user_id || body.otherUserId;
  if (hint) return { otherUserId: hint };

  return null;
}

const cancelarEvento = async (req, res) => {
  try {
    const userId = req.user.id;
    const vinculo = await resolverVinculo(req.params.id, userId, req.body || {});
    if (!vinculo || !vinculo.otherUserId) {
      return res.status(404).json({ error: 'Encontro não encontrado.' });
    }
    const { otherUserId } = vinculo;

    // 1) Remove TODOS os agendamentos entre os dois (qualquer direção).
    await db.sequelize.query(
      `DELETE FROM scheduled_events
        WHERE (created_by = :userId AND other_user_id = :otherUserId)
           OR (created_by = :otherUserId AND other_user_id = :userId)`,
      { replacements: { userId, otherUserId }, type: db.sequelize.QueryTypes.DELETE }
    );

    // 2) Desfaz o match — sem isso o card volta como "A combinar" no refresh.
    const matchesRemovidos = await Match.destroy({
      where: {
        [Op.or]: [
          { user1_id: userId, user2_id: otherUserId },
          { user1_id: otherUserId, user2_id: userId },
        ],
      },
    });

    // 3) Avisa os dois lados em tempo real (se o outro estiver com a tela aberta).
    try {
      const io = req.app.get('socketio');
      if (io) {
        const payload = { by: userId, other_user_id: otherUserId };
        io.to(`user_${userId}`).emit('encontro_cancelado', payload);
        io.to(`user_${otherUserId}`).emit('encontro_cancelado', { by: userId, other_user_id: userId });
      }
    } catch (socketError) {
      console.error('Erro ao emitir encontro_cancelado:', socketError.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Encontro removido permanentemente!',
      other_user_id: otherUserId,
      matchesRemovidos,
    });
  } catch (error) {
    console.error('Erro ao cancelar:', error);
    return res.status(500).json({ error: 'Erro ao cancelar evento.' });
  }
};

module.exports = { meusEncontros, criarEncontro, cancelarEvento };