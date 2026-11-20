// Como uma mensagem sai da API para os clientes (REST e Socket.IO).
//
// Regra de segurança da VISUALIZAÇÃO ÚNICA: a URL da foto nunca sai em
// listagens, `new_message`, prévias ou acks. Ela é entregue uma única vez,
// pela rota/evento de abertura (ver services/viewOnce.js).

const DELETED_TEXT = '🚫 Mensagem apagada';
const INVITE_TAG = '[CONVITE_EVENTO]';
const VIEW_ONCE_OPENED_MARK = '[VIEW_ONCE_ABERTA]';

const IMAGE_URL = /^https?:\/\/\S+\.(png|jpe?g|gif|webp|heic)(\?\S*)?$/i;
const GIF_HOST = /^https?:\/\/\S*(giphy\.com|tenor\.com|media\d*\.giphy)/i;
const MAPS_URL = /https?:\/\/(?:maps\.google\.com|www\.google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)\S*/i;

function toPlain(message) {
  if (!message) return null;
  return typeof message.toJSON === 'function' ? message.toJSON() : { ...message };
}

function isImageContent(text) {
  const value = String(text || '').trim();
  return IMAGE_URL.test(value) || GIF_HOST.test(value) || value.includes('res.cloudinary.com');
}

// Tipo da mensagem, usado nas prévias da lista de conversas.
//   text | image | view_once | location | invite | invite_answer | deleted
function classifyMessage(message) {
  const m = toPlain(message) || {};
  const content = typeof m.content === 'string' ? m.content : '';
  if (content === DELETED_TEXT) return 'deleted';
  if (m.is_view_once) return 'view_once';
  if (content.startsWith(INVITE_TAG)) return 'invite';
  if (/^(✅ Convite Aceite!|❌ Convite Recusado)$/.test(content)) return 'invite_answer';
  if (isImageContent(content)) return 'image';
  if (MAPS_URL.test(content)) return 'location';
  return 'text';
}

// Texto curto da prévia (sem emoji: o cliente desenha o ícone pelo `type`).
function previewText(message) {
  const m = toPlain(message) || {};
  const tipo = classifyMessage(m);
  switch (tipo) {
    case 'deleted': return 'Mensagem apagada';
    case 'view_once': return m.is_opened ? 'Foto aberta' : 'Foto de visualização única';
    case 'invite': return 'Convite de encontro';
    case 'invite_answer': return m.content.startsWith('✅') ? 'Convite aceito' : 'Convite recusado';
    case 'image': return m.caption ? String(m.caption) : 'Foto';
    case 'location': return 'Localização';
    default: {
      const texto = String(m.content || '').replace(/\s+/g, ' ').trim();
      return texto.length > 80 ? `${texto.slice(0, 77)}...` : texto;
    }
  }
}

// Mensagem pronta para sair da API. Para visualização única, some com a URL
// e a legenda — o cliente mostra só o card "Foto"/"Aberta".
function serializeMessage(message) {
  const m = toPlain(message);
  if (!m) return m;
  if (m.is_view_once) {
    m.content = null;
    m.caption = null;
    m.media_type = 'image';
  }
  return m;
}

module.exports = {
  DELETED_TEXT,
  INVITE_TAG,
  VIEW_ONCE_OPENED_MARK,
  classifyMessage,
  previewText,
  serializeMessage,
  isImageContent,
};
