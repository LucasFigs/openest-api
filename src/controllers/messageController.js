const db = require('../models');
const { DataTypes } = require('sequelize');

let Message = db.Message || db.sequelize.models.Message;
if (!Message) { const messageModel = require('../models/message'); Message = messageModel(db.sequelize, DataTypes); }

let Conversation = db.Conversation || db.sequelize.models.Conversation;
if (!Conversation) { const conversationModel = require('../models/conversation'); Conversation = conversationModel(db.sequelize, DataTypes); }

let Match = db.Match || db.sequelize.models.Match;
if (!Match) { const matchModel = require('../models/match'); Match = matchModel(db.sequelize, DataTypes); }

let User = db.User || db.sequelize.models.User;
if (!User) { const userModel = require('../models/user'); User = userModel(db.sequelize, DataTypes); }

exports.sendMessage = async (req, res) => {
  try {
    const { conversation_id, content } = req.body;
    const sender_id = req.user.id;
    const conversation = await Conversation.findByPk(conversation_id);
    if (!conversation) return res.status(404).json({ message: "Conversa não encontrada" });

    const match = await Match.findByPk(conversation.match_id);
    if (!match) return res.status(404).json({ message: "Match não encontrado" });

    const newMessage = await Message.create({ conversation_id, sender_id, content });
    const recipientId = match.user1_id === sender_id ? match.user2_id : match.user1_id;
    const recipient = await User.findByPk(recipientId);

    let notificationTitle = req.user.name; 
    let notificationBody = content;        
    if (recipient && recipient.modo_discreto) { notificationTitle = "Nova mensagem"; notificationBody = "Você recebeu uma nova mensagem"; }

    const io = req.app.get('socketio'); 
    io.to(`chat_${conversation_id}`).emit('new_message', newMessage);
    io.to(`user_${recipientId}`).emit('notification', { title: notificationTitle, body: notificationBody, conversation_id });

    return res.status(201).json(newMessage);
  } catch (error) { return res.status(500).json({ error: error.message }); }
};

exports.sendImageMessage = async (req, res) => {
  try {
    const { conversation_id } = req.body;
    const sender_id = req.user.id;
    if (!req.file) return res.status(400).json({ error: "Nenhuma imagem foi enviada" });

    const imageUrl = req.file.path; 
    const conversation = await Conversation.findByPk(conversation_id);
    if (!conversation) return res.status(404).json({ message: "Conversa não encontrada" });

    const match = await Match.findByPk(conversation.match_id);
    if (!match) return res.status(404).json({ message: "Match não encontrado" });

    const newMessage = await Message.create({ conversation_id, sender_id, content: imageUrl });
    const recipientId = match.user1_id === sender_id ? match.user2_id : match.user1_id;
    const recipient = await User.findByPk(recipientId);

    let notificationTitle = req.user.name; 
    let notificationBody = "📷 Nova imagem recebida"; 
    if (recipient && recipient.modo_discreto) { notificationTitle = "Nova mensagem"; notificationBody = "Você recebeu uma nova mensagem"; }

    const io = req.app.get('socketio'); 
    io.to(`chat_${conversation_id}`).emit('new_message', newMessage);
    io.to(`user_${recipientId}`).emit('notification', { title: notificationTitle, body: notificationBody, conversation_id });

    return res.status(201).json(newMessage);
  } catch (error) { return res.status(500).json({ error: error.message }); }
};

exports.getChatMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { count, rows } = await Message.findAndCountAll({ where: { conversation_id: id }, limit, offset, order: [['id', 'DESC']] });
    return res.json({ messages: rows, pagination: { total: count, page, limit, hasNext: count > (offset + limit) } });
  } catch (error) { return res.status(500).json({ error: error.message }); }
};

exports.deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id; 
    const message = await Message.findByPk(id);
    if (!message) return res.status(404).json({ error: "Mensagem não encontrada" });
    if (message.sender_id !== userId) return res.status(403).json({ error: "Permissão negada" });

    const conversationId = message.conversation_id;
    await message.update({ content: "🚫 Mensagem apagada" });
    
    const io = req.app.get('socketio');
    io.to(`chat_${conversationId}`).emit('message_deleted', id);
    return res.json({ success: true, message: "Apagada" });
  } catch (error) { return res.status(500).json({ error: error.message }); }
};

// 🔥 NOVA FUNÇÃO: RESPONDE AO CONVITE
exports.responderConvite = async (req, res) => {
  try {
    const { id } = req.params;
    const { resposta } = req.body; 
    const message = await Message.findByPk(id);
    if (!message) return res.status(404).json({ error: "Mensagem não encontrada" });

    const novoStatus = resposta === 'aceite' ? '✅ Convite Aceite!' : '❌ Convite Recusado';
    await message.update({ content: novoStatus });

    const io = req.app.get('socketio');
    io.to(`chat_${message.conversation_id}`).emit('invite_updated', { messageId: id, eventId: id, status: resposta });

    return res.json({ success: true, message: novoStatus });
  } catch (error) { return res.status(500).json({ error: error.message }); }
};