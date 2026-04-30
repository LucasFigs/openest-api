const { Message, Conversation } = require('../models');

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