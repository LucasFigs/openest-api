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

// T048 — avisos em tempo real + push centralizados (REST e socket usam o mesmo fluxo)
const { notifyNewMessage } = require('../services/notificationService');
const { getOtherParticipantId } = require('../services/notificationContent');
const messageStatus = require('../services/messageStatus');

// Confirma que o usuário logado participa da conversa e devolve o outro id.
async function resolveParticipants(conversationId, userId) {
  const conversation = await Conversation.findByPk(conversationId);
  if (!conversation) return null;
  const match = await Match.findByPk(conversation.match_id);
  if (!match) return null;
  const otherUserId = getOtherParticipantId(match, userId);
  if (!otherUserId) return null;
  return { conversation, match, otherUserId };
}

// POST /api/conversas/:id/entregue — 2 checks cinzas.
exports.marcarComoEntregue = async (req, res) => {
  try {
    const conversationId = req.params.id;
    const access = await resolveParticipants(conversationId, req.user.id);
    if (!access) return res.status(404).json({ error: 'Conversa não encontrada' });

    const io = req.app.get('socketio');
    const result = await messageStatus.markDelivered({
      db, io, conversationId, recipientId: req.user.id,
    });
    return res.json({ success: true, status: 'delivered', updated: result.updatedIds.length });
  } catch (error) { return res.status(500).json({ error: error.message }); }
};

// POST /api/conversas/:id/ler — 2 checks AZUIS, exceto se qualquer um dos
// dois participantes estiver com o Modo Discreto ligado (aí para em entregue).
exports.marcarComoLida = async (req, res) => {
  try {
    const conversationId = req.params.id;
    const access = await resolveParticipants(conversationId, req.user.id);
    if (!access) return res.status(404).json({ error: 'Conversa não encontrada' });

    const io = req.app.get('socketio');
    const result = await messageStatus.markRead({
      db, io, conversationId, readerId: req.user.id, otherUserId: access.otherUserId,
    });
    return res.json({
      success: true,
      status: result.allowRead ? 'read' : 'delivered',
      updated: result.updatedIds.length,
      read_receipts_blocked: !result.allowRead,
    });
  } catch (error) { return res.status(500).json({ error: error.message }); }
};

exports.sendMessage = async (req, res) => {
  try {
    const { conversation_id, content } = req.body;
    const sender_id = req.user.id;
    const conversation = await Conversation.findByPk(conversation_id);
    if (!conversation) return res.status(404).json({ message: "Conversa não encontrada" });

    const match = await Match.findByPk(conversation.match_id);
    if (!match) return res.status(404).json({ message: "Match não encontrado" });

    // Só quem participa do match pode escrever nesta conversa.
    const recipientId = getOtherParticipantId(match, sender_id);
    if (!recipientId) return res.status(403).json({ error: "Você não participa desta conversa" });

    const newMessage = await Message.create({ conversation_id, sender_id, content });

    const io = req.app.get('socketio'); 
    io.to(`chat_${conversation_id}`).emit('new_message', newMessage);
    // Sem await: o push é enviado em segundo plano e nunca derruba a resposta.
    notifyNewMessage({ io, conversationId: conversation_id, senderId: sender_id, senderName: req.user.name, senderAvatar: req.user.foto_url, recipientId, content });

    // Quem responde, leu o que recebeu nessa conversa (respeitando o Modo
    // Discreto). Em segundo plano: nunca derruba o envio.
    messageStatus.markRead({
      db, io, conversationId: conversation_id, readerId: sender_id, otherUserId: recipientId,
    }).catch((e) => console.error('Erro ao marcar lidas ao responder:', e.message));

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

    const recipientId = getOtherParticipantId(match, sender_id);
    if (!recipientId) return res.status(403).json({ error: "Você não participa desta conversa" });

    const newMessage = await Message.create({ conversation_id, sender_id, content: imageUrl });

    const io = req.app.get('socketio'); 
    io.to(`chat_${conversation_id}`).emit('new_message', newMessage);
    notifyNewMessage({ io, conversationId: conversation_id, senderId: sender_id, senderName: req.user.name, senderAvatar: req.user.foto_url, recipientId, content: imageUrl, isImage: true });

    return res.status(201).json(newMessage);
  } catch (error) { return res.status(500).json({ error: error.message }); }
};

exports.getChatMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Abrir a conversa conta como leitura. Marca ANTES de buscar para a
    // resposta já sair com os status atualizados. Respeita o Modo Discreto
    // e nunca derruba a listagem se algo falhar aqui.
    if (page === 1 && req.user && req.user.id) {
      try {
        const access = await resolveParticipants(id, req.user.id);
        if (access) {
          await messageStatus.markRead({
            db, io: req.app.get('socketio'), conversationId: id,
            readerId: req.user.id, otherUserId: access.otherUserId,
          });
        }
      } catch (statusError) {
        console.error('Erro ao marcar conversa como lida:', statusError.message);
      }
    }

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