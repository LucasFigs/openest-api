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

function buildMessageNotification({ senderName, recipientDiscreet, content, isImage = false }) {
  if (recipientDiscreet) return { ...DISCREET_MESSAGE };
  const body = isImage || looksLikeImageUrl(content) ? '📷 Nova imagem recebida' : truncate(content) || 'Nova mensagem';
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

module.exports = {
  DISCREET_MESSAGE,
  DISCREET_MATCH,
  buildMessageNotification,
  buildMatchNotification,
  buildNotificationData,
  getOtherParticipantId,
  looksLikeImageUrl,
  truncate,
};
