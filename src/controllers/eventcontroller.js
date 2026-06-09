const { Match, User, Conversation } = require('../models');
const { Op } = require('sequelize');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/events/meus-encontros
// Retorna os matches do usuário logado formatados como "eventos" para o calendário.
// Cada match vira um evento, usando o created_at do match como data do encontro.
// ─────────────────────────────────────────────────────────────────────────────
const meusEncontros = async (req, res) => {
  try {
    const userId = req.user.id;
    const { mes, ano } = req.query;

    // Monta filtro de data se mes/ano forem passados
    let dateFilter = {};
    if (mes && ano) {
      const inicio = new Date(parseInt(ano), parseInt(mes) - 1, 1);
      const fim    = new Date(parseInt(ano), parseInt(mes), 1);
      dateFilter = { created_at: { [Op.gte]: inicio, [Op.lt]: fim } };
    }

    // Busca todos os matches onde o usuário logado participa
    const matches = await Match.findAll({
      where: {
        [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
        ...dateFilter,
      },
      order: [['created_at', 'DESC']],
    });

    if (!matches.length) {
      return res.status(200).json([]);
    }

    // Para cada match, busca os dados do outro usuário e a conversa
    const eventos = await Promise.all(
      matches.map(async (match) => {
        const outroUserId = match.user1_id === userId ? match.user2_id : match.user1_id;

        // Dados do outro usuário
        const outroUser = await User.findByPk(outroUserId, {
          attributes: ['id', 'name', 'foto_url', 'bio'],
        });

        // Conversa ligada ao match (para o botão de chat)
        const conversa = await Conversation.findOne({
          where: { match_id: match.id },
          attributes: ['id'],
        });

        // Monta o objeto no formato que o Events.jsx espera
        return {
          id:            match.id,
          titulo:        `Encontro com ${outroUser?.name || 'Usuário'}`,
          data_encontro: match.created_at,   // data do match = data do "encontro"
          local:         'A combinar via chat',
          matchId:       conversa?.id || null,  // id da conversa para o botão de chat
          matchName:     outroUser?.name || 'Usuário',
          fotos:         outroUser?.foto_url ? [outroUser.foto_url] : [],
          bio:           outroUser?.bio || '',
        };
      })
    );

    return res.status(200).json(eventos);

  } catch (error) {
    console.error('Erro em meusEncontros:', error);
    return res.status(500).json({ error: 'Erro interno ao buscar eventos.' });
  }
};

module.exports = { meusEncontros };