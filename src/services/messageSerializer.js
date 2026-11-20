// Como uma mensagem sai da API para os clientes (REST e Socket.IO).
//
// Regra de segurança da VISUALIZAÇÃO ÚNICA: a URL da foto nunca sai em
// listagens, `new_message`, prévias ou acks. Ela é entregue uma única vez,
// pela rota/evento de abertura (ver services/viewOnce.js).

const DELETED_TEXT = '🚫 Mensagem apagada';
const INVITE_TAG = '[CONVITE_EVENTO]';
const VIEW_ONCE_OPENED_MARK = '[VIEW_ONCE_ABERTA]';
// Convite aceito: guarda os dados do encontro (antes o texto "✅ Convite
// Aceite!" sobrescrevia o convite e a data/local se perdiam).
const MEETING_TAG = '[ENCONTRO_MARCADO]';
const INVITE_ACCEPTED_TEXT = '✅ Convite Aceite!';
const INVITE_REJECTED_TEXT = '❌ Convite Recusado';
const REPLY_PREVIEW_MAX = 200;

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
  if (content.startsWith(MEETING_TAG)) return 'invite_answer';
  if (content === INVITE_ACCEPTED_TEXT || content === INVITE_REJECTED_TEXT) return 'invite_answer';
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
    case 'invite_answer':
      return m.content === INVITE_REJECTED_TEXT ? 'Convite recusado' : 'Encontro marcado';
    case 'image': return m.caption ? String(m.caption) : 'Foto';
    case 'location': return 'Localização';
    default: {
      const texto = String(m.content || '').replace(/\s+/g, ' ').trim();
      return texto.length > 80 ? `${texto.slice(0, 77)}...` : texto;
    }
  }
}

// Dados do encontro de um convite ([CONVITE_EVENTO]{...}) ou de um convite
// aceito ([ENCONTRO_MARCADO]{...}). null se não for nenhum dos dois.
function parseMeeting(content, tag) {
  const value = String(content || '');
  if (!value.startsWith(tag)) return null;
  try {
    const data = JSON.parse(value.slice(tag.length));
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

// Conteúdo gravado quando o convite é aceito: só os campos do encontro.
function buildMeetingContent(invite) {
  const d = invite || {};
  const meeting = {};
  for (const key of ['titulo', 'scheduled_at', 'local', 'nota']) {
    if (d[key] != null && d[key] !== '') meeting[key] = d[key];
  }
  return `${MEETING_TAG}${JSON.stringify(meeting)}`;
}

// Resumo da mensagem citada numa resposta. Nunca expõe a URL de uma foto
// (de visualização única ou não): mídia vira só o rótulo ("Foto").
function replySummary(original, senderName = null) {
  const o = toPlain(original);
  if (!o) return null;
  const type = classifyMessage(o);
  let content = previewText(o);
  if (type === 'text') {
    const texto = String(o.content || '').trim();
    content = texto.length > REPLY_PREVIEW_MAX ? `${texto.slice(0, REPLY_PREVIEW_MAX - 3)}...` : texto;
  }
  const nome = senderName || (o.sender && o.sender.name) || null;
  return { id: o.id, sender_id: o.sender_id, sender_name: nome, type, content };
}

// Mensagem pronta para sair da API. Para visualização única, some com a URL
// e a legenda — o cliente mostra só o card "Foto"/"Aberta".
// `replyTarget` (opcional) = mensagem citada já carregada; sem ele, usa o
// include `replyTo` da consulta, se houver.
function serializeMessage(message, replyTarget = undefined) {
  const m = toPlain(message);
  if (!m) return m;
  // Só objeto ou null contam (protege contra `rows.map(serializeMessage)`,
  // que passaria o índice do array aqui).
  const temCitada = replyTarget === null || (replyTarget && typeof replyTarget === 'object');
  const citada = temCitada ? replyTarget : m.replyTo;
  delete m.replyTo;
  if (m.reply_to_id != null || citada) {
    m.reply_to = citada ? replySummary(citada) : null;
  }
  if (m.is_view_once) {
    m.content = null;
    m.caption = null;
    m.media_type = 'image';
  }
  const encontro = parseMeeting(m.content, MEETING_TAG);
  if (encontro) m.meeting = encontro;
  else if (m.content === INVITE_ACCEPTED_TEXT) m.meeting = {};
  return m;
}

module.exports = {
  DELETED_TEXT,
  INVITE_TAG,
  MEETING_TAG,
  INVITE_ACCEPTED_TEXT,
  INVITE_REJECTED_TEXT,
  VIEW_ONCE_OPENED_MARK,
  parseMeeting,
  buildMeetingContent,
  replySummary,
  classifyMessage,
  previewText,
  serializeMessage,
  isImageContent,
};
