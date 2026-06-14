const { Conversation, Message, User, Match } = require('../models');
const { Op } = require('sequelize');

exports.listConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    const matches = await Match.findAll({
      where: { [Op.or]: [{ user1_id: userId }, { user2_id: userId }] }
    });

    if (!matches.length) return res.status(200).json([]);

    const matchIds = matches.map(m => m.id);

    const conversations = await Conversation.findAll({
      where: { match_id: { [Op.in]: matchIds } },
      include: [{ model: Message, as: 'messages', limit: 1, order: [['created_at', 'DESC']] }]
    });

    const formatted = await Promise.all(conversations.map(async (conv) => {
      const match       = matches.find(m => m.id === conv.match_id);
      const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;
      const otherUser   = await User.findByPk(otherUserId, { attributes: ['id', 'name', 'foto_url'] });

      return {
        id:            conv.id,
        other_user_id: otherUserId,   // ← campo necessário para o agendamento
        name:          otherUser?.name || 'Usuário',
        img:           otherUser?.foto_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherUser?.name || 'U')}`,
        timestamp:     'Agora',
        lastMessage:   conv.messages.length > 0 ? conv.messages[0].content : 'Nenhuma mensagem',
        unreadCount:   0,
      };
    }));

    return res.status(200).json(formatted);
  } catch (error) {
    console.error("Erro ao listar conversas:", error);
    return res.status(500).json({ error: error.message });
  }
};