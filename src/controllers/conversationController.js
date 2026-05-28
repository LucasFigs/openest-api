const { Conversation, Message, User, Match } = require('../models');
const { Op } = require('sequelize');

exports.listConversations = async (req, res) => {
  try {
    const userId = req.user.id; // Usuário logado

    // 1. Busca todos os matches onde o usuário logado participa
    const matches = await Match.findAll({
      where: {
        [Op.or]: [{ user1_id: userId }, { user2_id: userId }]
      }
    });

    if (!matches.length) return res.status(200).json([]);

    const matchIds = matches.map(m => m.id);

    // 2. Busca as conversas vinculadas a esses matches (com a última mensagem)
    const conversations = await Conversation.findAll({
      where: { match_id: { [Op.in]: matchIds } },
      include: [
        {
          model: Message,
          as: 'messages',
          limit: 1,
          order: [['created_at', 'DESC']]
        }
      ]
    });

    // 3. Monta a lista formatada buscando a foto do "outro" usuário
    const formatted = await Promise.all(conversations.map(async (conv) => {
      // Descobre quem é o outro usuário no match
      const match = matches.find(m => m.id === conv.match_id);
      const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;
      
      // Busca o perfil da pessoa
      const otherUser = await User.findByPk(otherUserId, { attributes: ['id', 'name', 'foto_url'] });
      
      return {
        id: conv.id,
        name: otherUser ? otherUser.name : 'Usuário',
        img: otherUser ? (otherUser.foto_url || 'https://ui-avatars.com/api/?name=' + otherUser.name) : '',
        timestamp: 'Agora',
        lastMessage: conv.messages.length > 0 ? conv.messages[0].content : 'Nenhuma mensagem'
      };
    }));

    return res.status(200).json(formatted);
  } catch (error) {
    console.error("Erro ao listar conversas:", error);
    return res.status(500).json({ error: error.message });
  }
};