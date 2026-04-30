const { Conversation, Message, User } = require('../models');
const { Op } = require('sequelize');

exports.listConversations = async (req, res) => {
  try {
    const userId = req.user.id; // Usuário logado vindo do auth.js

    const conversations = await Conversation.findAll({
      where: {
        [Op.or]: [{ user_id_1: userId }, { user_id_2: userId }]
      },
      include: [
        {
          model: Message,
          as: 'messages',
          limit: 1,
          order: [['created_at', 'DESC']] // Incluir última mensagem
        },
        {
          model: User,
          as: 'Participant1', // Depende de como você nomeou as associações no Model
          attributes: ['id', 'name', 'photo_url'] 
        },
        {
          model: User,
          as: 'Participant2',
          attributes: ['id', 'name', 'photo_url']
        }
      ],
      order: [['updated_at', 'DESC']] // Conversas recentes primeiro
    });

    return res.status(200).json(conversations);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};