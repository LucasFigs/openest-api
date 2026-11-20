// Foto de VISUALIZAÇÃO ÚNICA (estilo WhatsApp).
//
// A URL da foto só sai da API aqui, uma única vez, para o DESTINATÁRIO, no
// momento em que ele toca para abrir. A partir daí:
//   - a mensagem fica `is_opened = true` (viewed_at = agora);
//   - a URL é apagada do banco (content vira um marcador);
//   - o arquivo é apagado do Cloudinary pouco depois (tempo de o app baixar);
//   - os dois lados recebem `message_view_once_opened` em tempo real.
// Qualquer nova tentativa recebe 410 (Gone) — não há como abrir de novo.
const { userRoom, chatRoom } = require('../utils/rooms');
const { VIEW_ONCE_OPENED_MARK } = require('./messageSerializer');

const OPENED_EVENT = 'message_view_once_opened';
// Tempo para o app terminar de baixar a imagem antes de ela sumir da nuvem.
const DEFAULT_DESTROY_DELAY_MS = 2 * 60 * 1000;

class ViewOnceError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// 'https://res.cloudinary.com/<cloud>/image/upload/v123/openest_uploads/abc.jpg'
//   → 'openest_uploads/abc'
function publicIdFromUrl(url) {
  const match = /\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?([^?#]+?)(?:\.[a-z0-9]+)?(?:[?#].*)?$/i.exec(String(url || ''));
  return match ? match[1] : null;
}

async function defaultDestroyMedia(url) {
  if (!String(url || '').includes('res.cloudinary.com')) return { skipped: true };
  const publicId = publicIdFromUrl(url);
  if (!publicId) return { skipped: true };
  const cloudinary = require('cloudinary').v2; // singleton já configurado em config/cloudinary
  return cloudinary.uploader.destroy(publicId);
}

async function defaultGetAccess(conversationId, userId) {
  const { getConversationAccess } = require('./notificationService');
  return getConversationAccess(conversationId, userId);
}

async function openViewOnce({
  db,
  io,
  messageId,
  userId,
  getAccess = defaultGetAccess,
  destroyMedia = defaultDestroyMedia,
  destroyDelayMs = DEFAULT_DESTROY_DELAY_MS,
  logger = console,
  now = new Date(),
}) {
  const message = await db.Message.findByPk(messageId);
  if (!message) throw new ViewOnceError('not_found', 404, 'Mensagem não encontrada.');
  if (!message.is_view_once) {
    throw new ViewOnceError('not_view_once', 400, 'Esta mensagem não é de visualização única.');
  }

  const access = await getAccess(message.conversation_id, userId);
  if (!access) throw new ViewOnceError('forbidden', 403, 'Você não participa desta conversa.');

  if (String(message.sender_id) === String(userId)) {
    throw new ViewOnceError('sender', 403, 'Quem enviou não pode abrir a própria foto de visualização única.');
  }
  if (message.is_opened) {
    throw new ViewOnceError('already_opened', 410, 'Esta foto já foi aberta.');
  }

  // Lidos ANTES de apagar do banco.
  const url = message.content;
  const caption = message.caption || null;

  // Abertura ATÔMICA: o WHERE `is_opened = false` garante que, se dois
  // pedidos chegarem juntos (dois toques, duas abas), só um vence.
  const [afetadas] = await db.Message.update(
    { is_opened: true, viewed_at: now, content: VIEW_ONCE_OPENED_MARK, caption: null },
    { where: { id: message.id, is_opened: false } }
  );
  if (!afetadas) throw new ViewOnceError('already_opened', 410, 'Esta foto já foi aberta.');

  const payload = {
    message_id: message.id,
    conversation_id: message.conversation_id,
    viewed_at: now,
  };
  if (io) {
    io.to(chatRoom(message.conversation_id)).emit(OPENED_EVENT, payload);
    io.to(userRoom(message.sender_id)).emit(OPENED_EVENT, payload);
    io.to(userRoom(userId)).emit(OPENED_EVENT, payload);
  }

  // Some com o arquivo da nuvem depois que o app teve tempo de baixar.
  const timer = setTimeout(() => {
    Promise.resolve()
      .then(() => destroyMedia(url))
      .catch((error) => logger.error('⚠️ Falha ao apagar mídia de visualização única:', error.message || error));
  }, destroyDelayMs);
  if (timer && typeof timer.unref === 'function') timer.unref();

  return { ...payload, url, caption };
}

module.exports = {
  OPENED_EVENT,
  ViewOnceError,
  openViewOnce,
  publicIdFromUrl,
  defaultDestroyMedia,
};
