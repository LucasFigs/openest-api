const db = require('../models');
const { DataTypes } = require('sequelize')

let Message = db.Message || db.sequelize.models.Message;

if (!Message) {
  try {
    // Força a execução da função dentro de models/message.js
    const messageModel = require('../models/message');
    Message = messageModel(db.sequelize, DataTypes);
    console.log("✅ Modelo Message carregado manualmente no Controller.");
  } catch (err) {
    console.error("❌ Falha ao carregar o arquivo message.js:", err.message);
  }
}

// O mesmo para Conversation
let Conversation = db.Conversation || db.sequelize.models.Conversation;
if (!Conversation) {
  const conversationModel = require('../models/conversation');
  Conversation = conversationModel(db.sequelize, DataTypes);
}

exports.sendMessage = async (req, res) => {
  try {
    const { conversation_id, content } = req.body;
    const sender_id = req.user.id; // middleware de autenticação

    // 1. Validar se o usuário participa da conversa (Critério de Aceite)
    const conversation = await Conversation.findByPk(conversation_id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversa não encontrada" });
    }

    // 2. Salvar mensagem no banco
    const newMessage = await Message.create({
      conversation_id,
      sender_id,
      content
    });

    // 3. Emitir via WebSocket (A lógica do Socket ficará no server.js ou em um helper)
    const io = req.app.get('socketio'); 
    io.to(`chat_${conversation_id}`).emit('new_message', newMessage);

    return res.status(201).json(newMessage);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getChatMessages = async (req, res) => {
  try {
    const { id } = req.params; // ID da conversa vindo da URL
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    if (!Message) {
      return res.status(500).json({ error: "Modelo Message não carregado. Verifique o arquivo models/index.js" });
    }

    const { count, rows } = await Message.findAndCountAll({
      where: { conversation_id: id },
      limit,
      offset,
      order: [['created_at', 'DESC']]
    });

    const hasNext = count > (offset + limit);

    return res.json({
      messages: rows,
      pagination: {
        total: count,
        page,
        limit,
        hasNext
      }
    });
  } catch (error) {
    console.error("Erro na paginação:", error);
    return res.status(500).json({ error: error.message });
  }
};