const db = require('../models');
const { Match, User, Conversation } = db;
const { Op } = require('sequelize');

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
      };
    }));

    let eventosAgendados = [];
    try {
      let schedQuery = `
        SELECT se.*, u.name as match_name, u.foto_url
        FROM scheduled_events se
        LEFT JOIN "Users" u ON u.id = se.other_user_id
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

      // 🔥 CORREÇÃO: Pega todos os eventos do array, e não apenas o primeiro!
      const rows = await db.sequelize.query(schedQuery, {
        replacements,
        type: db.sequelize.QueryTypes.SELECT
      });

      const lista = rows || [];
      eventosAgendados = lista.map(e => ({
        id: `sched-${e.id}`, titulo: e.titulo || `Encontro com ${e.match_name}`,
        data_encontro: e.scheduled_at, local: e.local || 'A combinar', matchId: e.conversation_id || null,
        matchName: e.match_name || 'Usuário', fotos: e.foto_url ? [e.foto_url] : [],
        bio: '', tipo: 'agendado', nota: e.nota || '',
      }));
    } catch (_) {}

    return res.status(200).json([...eventosDeMatch, ...eventosAgendados]);
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

// 🔥 FUNÇÃO CORRIGIDA: Agora identifica se é um Match ou um Agendamento e apaga do lugar certo!
const cancelarEvento = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    if (id.startsWith('sched-')) {
      // 1. Se for um encontro marcado no chat (id começa com sched-)
      const eventId = parseInt(id.replace('sched-', ''), 10);
      
      await db.sequelize.query(
        `DELETE FROM scheduled_events WHERE id = :eventId AND (created_by = :userId OR other_user_id = :userId)`,
        { 
          replacements: { eventId, userId },
          type: db.sequelize.QueryTypes.DELETE 
        }
      );
    } else if (id.startsWith('match-')) {
      // 2. Se for um match automático (id começa com match-)
      const matchId = id.replace('match-', '');
      
      // Apaga o match permanentemente da tabela de Matches
      await Match.destroy({
        where: {
          id: matchId,
          [Op.or]: [{ user1_id: userId }, { user2_id: userId }]
        }
      });
    }

    return res.status(200).json({ success: true, message: "Removido permanentemente!" });
  } catch (error) { 
    console.error("Erro ao cancelar:", error);
    return res.status(500).json({ error: 'Erro ao cancelar evento.' }); 
  }
};

module.exports = { meusEncontros, criarEncontro, cancelarEvento };