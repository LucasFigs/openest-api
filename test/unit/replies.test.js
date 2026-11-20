// Resposta com citação (reply_to) e card "Encontro marcado".
// Sem banco: o Message/User são falsos.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  serializeMessage, replySummary, buildMeetingContent, classifyMessage, previewText,
  MEETING_TAG, INVITE_ACCEPTED_TEXT, INVITE_REJECTED_TEXT,
} = require('../../src/services/messageSerializer');
const { findReplyTarget } = require('../../src/services/replies');
const { setupSocket } = require('../../src/socket');

const FOTO = 'https://res.cloudinary.com/demo/image/upload/v1/chat/foto.jpg';

// ── Resumo da citação ────────────────────────────────────────────────────
test('replySummary devolve id, autor, tipo e texto da mensagem citada', () => {
  const r = replySummary({ id: 7, sender_id: 'u2', content: 'Bora no sábado?', sender: { name: 'Marina' } });
  assert.deepEqual(r, { id: 7, sender_id: 'u2', sender_name: 'Marina', type: 'text', content: 'Bora no sábado?' });
});

test('replySummary trunca textos longos', () => {
  const r = replySummary({ id: 1, sender_id: 'u2', content: 'a'.repeat(500) });
  assert.equal(r.content.length, 200);
  assert.ok(r.content.endsWith('...'));
});

test('replySummary nunca expõe a URL de foto (nem de visualização única)', () => {
  const foto = replySummary({ id: 2, sender_id: 'u2', content: FOTO });
  assert.equal(foto.type, 'image');
  assert.equal(foto.content, 'Foto');

  const unica = replySummary({ id: 3, sender_id: 'u2', content: FOTO, is_view_once: true });
  assert.equal(unica.type, 'view_once');
  assert.ok(!JSON.stringify(unica).includes('cloudinary'));
});

test('replySummary rotula localização e mensagem apagada', () => {
  assert.equal(replySummary({ id: 4, sender_id: 'u2', content: '📍 Localização partilhada:\nhttp://maps.google.com/maps?q=1,2' }).content, 'Localização');
  const apagada = replySummary({ id: 5, sender_id: 'u2', content: '🚫 Mensagem apagada' });
  assert.equal(apagada.type, 'deleted');
  assert.equal(apagada.content, 'Mensagem apagada');
});

// ── Serialização (histórico e new_message) ───────────────────────────────
test('serializeMessage transforma o include replyTo em reply_to', () => {
  const m = serializeMessage({
    id: 9, sender_id: 'u1', content: 'Sábado sim!', reply_to_id: 7,
    replyTo: { id: 7, sender_id: 'u2', content: 'Bora no sábado?', sender: { name: 'Marina' } },
  });
  assert.equal(m.replyTo, undefined);
  assert.deepEqual(m.reply_to, { id: 7, sender_id: 'u2', sender_name: 'Marina', type: 'text', content: 'Bora no sábado?' });
});

test('serializeMessage aceita a citada já carregada (envio)', () => {
  const m = serializeMessage({ id: 9, sender_id: 'u1', content: 'ok', reply_to_id: 7 }, { id: 7, sender_id: 'u2', content: 'oi' });
  assert.equal(m.reply_to.id, 7);
});

test('mensagem comum não ganha reply_to; citada removida vira reply_to null', () => {
  assert.equal('reply_to' in serializeMessage({ id: 1, content: 'oi', reply_to_id: null }), false);
  assert.equal(serializeMessage({ id: 1, content: 'oi', reply_to_id: 3, replyTo: null }).reply_to, null);
});

// ── findReplyTarget: só a mesma conversa ─────────────────────────────────
function fakeMessageModel(rows) {
  return {
    associations: {},
    async findOne({ where }) {
      return rows.find((r) => r.id === where.id && String(r.conversation_id) === String(where.conversation_id)) || null;
    },
  };
}

test('findReplyTarget acha a mensagem da mesma conversa', async () => {
  const Message = fakeMessageModel([{ id: 7, conversation_id: 10, content: 'oi' }]);
  const t = await findReplyTarget({ Message, conversationId: 10, replyToId: '7' });
  assert.equal(t.id, 7);
});

test('findReplyTarget ignora mensagem de OUTRA conversa e ids inválidos', async () => {
  const Message = fakeMessageModel([{ id: 7, conversation_id: 99, content: 'segredo' }]);
  assert.equal(await findReplyTarget({ Message, conversationId: 10, replyToId: 7 }), null);
  assert.equal(await findReplyTarget({ Message, conversationId: 10, replyToId: 'abc' }), null);
  assert.equal(await findReplyTarget({ Message, conversationId: 10, replyToId: null }), null);
});

// ── Socket: send_message com reply_to_id ─────────────────────────────────
test('send_message salva reply_to_id e o new_message já sai com reply_to', async () => {
  const created = [];
  const emitted = [];
  const io = {
    middleware: null,
    onConnection: null,
    use(fn) { this.middleware = fn; },
    on(event, fn) { if (event === 'connection') this.onConnection = fn; },
    to(room) { return { emit: (event, payload) => emitted.push({ room, event, payload }) }; },
  };
  const original = { id: 7, conversation_id: 10, sender_id: 'u2', content: 'Bora no sábado?', sender: { name: 'Marina' } };
  setupSocket(io, {
    logger: { log() {}, error() {} },
    verifyToken: async () => ({ id: 'u1' }),
    db: {
      Message: {
        associations: {},
        create: async (data) => { const msg = { id: 20, ...data }; created.push(msg); return msg; },
        findOne: async ({ where }) => (where.id === 7 && String(where.conversation_id) === '10' ? original : null),
      },
      User: { findByPk: async () => ({ name: 'Ana' }) },
    },
    notifications: {
      getConversationAccess: async () => ({ otherUserId: 'u2' }),
      notifyNewMessage: async () => {},
    },
  });
  const handlers = {};
  const socket = {
    id: 's', handshake: { auth: { token: 'ok' } }, rooms: new Set(),
    join(r) { this.rooms.add(r); }, leave() {}, on(e, fn) { handlers[e] = fn; }, to() { return { emit() {} }; },
  };
  await new Promise((resolve) => io.middleware(socket, resolve));
  io.onConnection(socket);

  let ack;
  await handlers.send_message({ conversation_id: 10, content: 'Sábado sim!', reply_to_id: 7 }, (r) => { ack = r; });

  assert.equal(created[0].reply_to_id, 7);
  assert.equal(ack.ok, true);
  assert.equal(ack.message.reply_to.sender_name, 'Marina');
  const novo = emitted.find((e) => e.event === 'new_message');
  assert.equal(novo.payload.reply_to.content, 'Bora no sábado?');
});

// ── Encontro marcado ─────────────────────────────────────────────────────
test('convite aceito guarda data/local e sai com meeting', () => {
  const content = buildMeetingContent({
    titulo: 'Café', scheduled_at: '2026-11-22T19:00:00.000Z', local: 'Dragão do Mar', nota: '', other_user_id: 'x',
  });
  assert.ok(content.startsWith(MEETING_TAG));
  const m = serializeMessage({ id: 3, content });
  assert.deepEqual(m.meeting, { titulo: 'Café', scheduled_at: '2026-11-22T19:00:00.000Z', local: 'Dragão do Mar' });
  assert.equal(classifyMessage(m), 'invite_answer');
  assert.equal(previewText(m), 'Encontro marcado');
});

test('aceites antigos ("✅ Convite Aceite!") também viram card, sem detalhes', () => {
  const m = serializeMessage({ id: 3, content: INVITE_ACCEPTED_TEXT });
  assert.deepEqual(m.meeting, {});
  assert.equal(previewText(m), 'Encontro marcado');
  const recusado = serializeMessage({ id: 4, content: INVITE_REJECTED_TEXT });
  assert.equal(recusado.meeting, undefined);
  assert.equal(previewText(recusado), 'Convite recusado');
});
