// T045/T048 — Avisos em tempo real (Socket.io) + Push (Expo) para mensagens
// e matches. Centraliza o que antes estava duplicado nos controllers, para
// REST e WebSocket notificarem do mesmo jeito.
const db = require('../models');
const { userRoom } = require('../utils/rooms');
const { sendPushNotifications } = require('./pushService');
const {
  buildMatchNotification,
  buildNotificationData,
  buildRealtimeMessagePayload,
  buildRealtimeMatchPayload,
  getOtherParticipantId,
} = require('./notificationContent');

// Confirma que o usuário participa da conversa (via Match) e devolve quem é
// o outro participante. Usado para validar join/envio pelo socket.
async function getConversationAccess(conversationId, userId) {
  if (!conversationId || !userId) return null;
  const conversation = await db.Conversation.findByPk(conversationId);
  if (!conversation) return null;
  const match = await db.Match.findByPk(conversation.match_id);
  const otherUserId = getOtherParticipantId(match, userId);
  if (!otherUserId) return null;
  return { conversation, match, otherUserId };
}

async function getPushTokens(userId) {
  if (!db.PushToken) return [];
  const rows = await db.PushToken.findAll({ where: { user_id: userId }, attributes: ['token'] });
  return rows.map((row) => row.token);
}

async function pushToUser(userId, payload) {
  try {
    const tokens = await getPushTokens(userId);
    if (!tokens.length) return;
    const { invalidTokens } = await sendPushNotifications(tokens, payload);
    if (invalidTokens.length) {
      await db.PushToken.destroy({ where: { token: invalidTokens } });
    }
  } catch (error) {
    console.error('❌ Erro ao enviar push para o usuário', userId, error.message || error);
  }
}

// Nova mensagem: avisa o destinatário pela sala pessoal do socket
// (`user_<id>`) e por push. Nunca lança — a mensagem já foi salva.
async function notifyNewMessage({ io, conversationId, senderId, senderName, senderAvatar, recipientId, content, isImage = false }) {
  try {
    const [recipient, sender] = await Promise.all([
      db.User.findByPk(recipientId, { attributes: ['id', 'modo_discreto'] }),
      // Foto (Cloudinary) + nome do remetente para o banner, se não vieram prontos.
      senderAvatar && senderName
        ? Promise.resolve(null)
        : db.User.findByPk(senderId, { attributes: ['name', 'foto_url'] }),
    ]);

    const payload = buildRealtimeMessagePayload({
      conversationId,
      senderId,
      senderName: senderName || sender?.name || null,
      senderAvatar: senderAvatar || sender?.foto_url || null,
      content,
      isImage,
      recipientDiscreet: !!recipient?.modo_discreto,
    });

    if (io) io.to(userRoom(recipientId)).emit('notification', payload);

    await pushToUser(recipientId, {
      title: payload.title,
      body: payload.body,
      data: buildNotificationData({ type: 'message', conversationId }),
    });
  } catch (error) {
    console.error('❌ Erro ao notificar nova mensagem:', error.message || error);
  }
}

// Novo match: avisa os dois usuários em tempo real e manda push para quem
// NÃO está com o app aberto na tela de Descoberta (o outro participante —
// quem acabou de curtir já vê o modal de match na resposta HTTP).
async function notifyNewMatch({ io, matchId, conversationId, likerId, likedId }) {
  try {
    const users = await db.User.findAll({
      where: { id: [likerId, likedId] },
      attributes: ['id', 'name', 'foto_url', 'modo_discreto'],
    });
    const byId = Object.fromEntries(users.map((u) => [String(u.id), u]));
    const liker = byId[String(likerId)];
    const liked = byId[String(likedId)];

    if (io) {
      [likerId, likedId].forEach((userId) => {
        const other = String(userId) === String(likerId) ? liked : liker;
        io.to(userRoom(userId)).emit('new_match', buildRealtimeMatchPayload({
          matchId,
          conversationId,
          otherUserId: other?.id,
          otherUserName: other?.name,
          otherUserAvatar: other?.foto_url,
          otherDiscreet: !!other?.modo_discreto,
        }));
      });
    }

    const { title, body } = buildMatchNotification({
      otherUserName: liker?.name,
      recipientDiscreet: !!liked?.modo_discreto,
    });
    await pushToUser(likedId, {
      title,
      body,
      data: buildNotificationData({ type: 'match', conversationId }),
    });
  } catch (error) {
    console.error('❌ Erro ao notificar novo match:', error.message || error);
  }
}

module.exports = {
  getConversationAccess,
  notifyNewMessage,
  notifyNewMatch,
};
