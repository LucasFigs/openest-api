// T048 — Conteúdo das notificações (funções puras, fáceis de testar).
// Respeita o Modo Discreto: se o DESTINATÁRIO está em modo discreto, nem o
// nome de quem enviou nem o texto aparecem na tela de bloqueio.

const DISCREET_MESSAGE = { title: 'Nova mensagem', body: 'Você recebeu uma nova mensagem' };
const DISCREET_MATCH = { title: 'Novo match!', body: 'Você tem uma nova conexão no Openest' };
const MAX_BODY_LENGTH = 140;

function truncate(text, max = MAX_BODY_LENGTH) {
  const value = String(text || '').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function looksLikeImageUrl(content) {
  return typeof content === 'string' && /^https?:\/\/\S+\.(png|jpe?g|gif|webp|heic)(\?\S*)?$/i.test(content.trim());
}

function buildMessageNotification({ senderName, recipientDiscreet, content, isImage = false, isViewOnce = false }) {
  if (recipientDiscreet) return { ...DISCREET_MESSAGE };
  let body;
  if (isViewOnce) body = '📷 Foto de visualização única';
  else if (isImage || looksLikeImageUrl(content)) body = '📷 Nova imagem recebida';
  else body = truncate(content) || 'Nova mensagem';
  return { title: senderName || 'Nova mensagem', body };
}

function buildMatchNotification({ otherUserName, recipientDiscreet }) {
  if (recipientDiscreet) return { ...DISCREET_MATCH };
  return {
    title: 'Novo match! 💜',
    body: otherUserName ? `Você e ${otherUserName} deram match. Diga oi!` : 'Você tem um novo match. Diga oi!',
  };
}

// Payload "data" lido pelo app para o Deep Linking (T049): só ids, nada
// sensível — o app busca o resto (nome/foto) já autenticado.
function buildNotificationData({ type, conversationId }) {
  const data = { type };
  if (conversationId !== undefined && conversationId !== null) data.conversationId = String(conversationId);
  return data;
}

function getOtherParticipantId(match, userId) {
  if (!match || !userId) return null;
  if (String(match.user1_id) === String(userId)) return match.user2_id;
  if (String(match.user2_id) === String(userId)) return match.user1_id;
  return null;
}

// Só expõe uma URL de foto se for de verdade (Cloudinary/http). Evita mandar
// caminho local ou lixo que o cliente não conseguiria carregar.
function safeAvatar(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

// T048/Front-1 — payload do evento `notification` (socket) de NOVA MENSAGEM,
// usado pelo banner estilo Instagram no web e no mobile. Inclui nome, foto
// (Cloudinary) e prévia da mensagem. Modo Discreto do destinatário esconde
// nome, foto e texto (vira aviso genérico).
function buildRealtimeMessagePayload({
  conversationId, senderId, senderName, senderAvatar, content, isImage = false, isViewOnce = false,
  recipientDiscreet = false,
}) {
  const { title, body } = buildMessageNotification({ senderName, recipientDiscreet, content, isImage, isViewOnce });
  // Visualização única nunca leva a URL, nem na prévia.
  let preview;
  if (isViewOnce) preview = '📷 Foto de visualização única';
  else if (isImage || looksLikeImageUrl(content)) preview = '📷 Nova imagem';
  else preview = truncate(content);
  return {
    type: 'message',
    conversation_id: conversationId,
    sender_id: senderId,
    sender_name: recipientDiscreet ? null : (senderName || null),
    sender_avatar: recipientDiscreet ? null : safeAvatar(senderAvatar),
    content: recipientDiscreet ? null : (preview || null),
    title, // compat. com a notificação nativa
    body,
  };
}

// Front-1 — payload do evento `new_match` (socket) para o banner. `user_id` é
// o OUTRO usuário. Esconde nome/foto se o outro usuário está em Modo Discreto.
function buildRealtimeMatchPayload({
  matchId, conversationId, otherUserId, otherUserName, otherUserAvatar, otherDiscreet = false,
}) {
  return {
    type: 'match',
    match_id: matchId,
    conversation_id: conversationId,
    user_id: otherUserId,
    other_user_name: otherDiscreet ? null : (otherUserName || null),
    other_user_avatar: otherDiscreet ? null : safeAvatar(otherUserAvatar),
  };
}

module.exports = {
  DISCREET_MESSAGE,
  DISCREET_MATCH,
  buildMessageNotification,
  buildMatchNotification,
  buildNotificationData,
  buildRealtimeMessagePayload,
  buildRealtimeMatchPayload,
  getOtherParticipantId,
  looksLikeImageUrl,
  safeAvatar,
  truncate,
};
