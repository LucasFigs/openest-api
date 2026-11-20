// Confirmação de envio/entrega/leitura + trava recíproca do Modo Discreto.
// Usa fakes de db/io: nada de banco nem rede.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MESSAGE_STATUS, canShowReadReceipts, resolveStatus, buildStatusPatch,
  markDelivered, markRead,
} = require('../../src/services/messageStatus');

const { Op } = require('sequelize');

// --- fakes -----------------------------------------------------------------
function fakeMessage(id, senderId, status = MESSAGE_STATUS.SENT) {
  return {
    id, sender_id: senderId, status, delivered_at: null, read_at: null,
    async update(patch) { Object.assign(this, patch); },
  };
}

function fakeDb({ messages = [], users = [] } = {}) {
  return {
    Sequelize: { Op },
    Message: {
      async findAll({ where }) {
        const ne = where.sender_id[Op.ne];
        return messages.filter((m) => m.sender_id !== ne);
      },
    },
    User: {
      async findAll({ where }) {
        return users.filter((u) => where.id.includes(u.id));
      },
    },
  };
}

function fakeIo() {
  const emitted = [];
  return { emitted, to(room) { return { emit: (event, payload) => emitted.push({ room, event, payload }) }; } };
}

// --- lógica pura -----------------------------------------------------------
test('checks azuis só quando NINGUÉM está em Modo Discreto', () => {
  assert.equal(canShowReadReceipts(false, false), true);
  assert.equal(canShowReadReceipts(true, false), false, 'remetente discreto bloqueia');
  assert.equal(canShowReadReceipts(false, true), false, 'destinatário discreto bloqueia');
  assert.equal(canShowReadReceipts(true, true), false);
});

test('resolveStatus nunca regride e bloqueia read sem permissão', () => {
  assert.equal(resolveStatus('sent', 'delivered', {}), 'delivered');
  assert.equal(resolveStatus('read', 'delivered', {}), 'read', 'não volta de read p/ delivered');
  assert.equal(resolveStatus('sent', 'read', { allowRead: true }), 'read');
  assert.equal(resolveStatus('sent', 'read', { allowRead: false }), 'delivered', 'Modo Discreto trava em delivered');
});

test('buildStatusPatch carimba delivered_at/read_at uma única vez', () => {
  const msg = fakeMessage(1, 'U1');
  const p1 = buildStatusPatch(msg, 'read', { allowRead: true });
  assert.equal(p1.status, 'read');
  assert.ok(p1.delivered_at && p1.read_at);
  Object.assign(msg, p1);
  assert.equal(buildStatusPatch(msg, 'read', { allowRead: true }), null, 'sem mudança → não grava');
});

// --- fluxo completo --------------------------------------------------------
test('sent → delivered → read (2 checks AZUIS) com Modo Discreto desligado', async () => {
  const messages = [fakeMessage(1, 'ALICE'), fakeMessage(2, 'ALICE')];
  const db = fakeDb({
    messages,
    users: [{ id: 'ALICE', modo_discreto: false }, { id: 'BOB', modo_discreto: false }],
  });
  const io = fakeIo();

  // Bob recebe → entregue
  await markDelivered({ db, io, conversationId: 7, recipientId: 'BOB' });
  assert.equal(messages[0].status, 'delivered');
  assert.equal(io.emitted[0].event, 'message_status_updated');
  assert.equal(io.emitted[0].payload.status, 'delivered');

  // Bob abre a conversa → lido (azul)
  const result = await markRead({ db, io, conversationId: 7, readerId: 'BOB', otherUserId: 'ALICE' });
  assert.equal(result.allowRead, true);
  assert.equal(messages[0].status, 'read');
  assert.equal(messages[1].status, 'read');
  const last = io.emitted[io.emitted.length - 1];
  assert.equal(last.payload.status, 'read');
  assert.equal(last.payload.read_receipts_blocked, false);
});

test('Modo Discreto do DESTINATÁRIO bloqueia os checks azuis (fica em delivered)', async () => {
  const messages = [fakeMessage(1, 'ALICE')];
  const db = fakeDb({
    messages,
    users: [{ id: 'ALICE', modo_discreto: false }, { id: 'BOB', modo_discreto: true }],
  });
  const io = fakeIo();

  const result = await markRead({ db, io, conversationId: 7, readerId: 'BOB', otherUserId: 'ALICE' });
  assert.equal(result.allowRead, false);
  assert.equal(messages[0].status, 'delivered', 'nunca chega a read');
  assert.equal(messages[0].read_at, null, 'não carimba leitura');
  assert.equal(io.emitted[0].payload.read_receipts_blocked, true);
});

test('Modo Discreto do REMETENTE também bloqueia (regra recíproca)', async () => {
  const messages = [fakeMessage(1, 'ALICE')];
  const db = fakeDb({
    messages,
    // Quem ligou o Modo Discreto foi a ALICE (remetente) — mesmo assim o BOB
    // lendo não gera check azul para ninguém.
    users: [{ id: 'ALICE', modo_discreto: true }, { id: 'BOB', modo_discreto: false }],
  });
  const io = fakeIo();

  const result = await markRead({ db, io, conversationId: 7, readerId: 'BOB', otherUserId: 'ALICE' });
  assert.equal(result.allowRead, false);
  assert.equal(messages[0].status, 'delivered');
  assert.equal(messages[0].read_at, null);
});

test('markRead não mexe nas mensagens do próprio leitor', async () => {
  const messages = [fakeMessage(1, 'BOB')]; // enviada pelo próprio Bob
  const db = fakeDb({
    messages,
    users: [{ id: 'ALICE', modo_discreto: false }, { id: 'BOB', modo_discreto: false }],
  });
  const io = fakeIo();
  const result = await markRead({ db, io, conversationId: 7, readerId: 'BOB', otherUserId: 'ALICE' });
  assert.equal(result.updatedIds.length, 0);
  assert.equal(messages[0].status, 'sent');
  assert.equal(io.emitted.length, 0, 'nada mudou → não emite');
});

// --- Entrega do evento para quem precisa ver os próprios checks -----------
test('o evento vai para a sala da conversa E para a sala pessoal do remetente', async () => {
  const messages = [fakeMessage(1, 'ALICE')];
  const db = fakeDb({
    messages,
    users: [{ id: 'ALICE', modo_discreto: false }, { id: 'BOB', modo_discreto: false }],
  });
  const io = fakeIo();

  await markRead({ db, io, conversationId: 7, readerId: 'BOB', otherUserId: 'ALICE' });

  const salas = io.emitted.map((e) => e.room);
  assert.ok(salas.includes('chat_7'), 'emite para a sala da conversa');
  assert.ok(
    salas.includes('user:ALICE'),
    'emite para a sala pessoal da ALICE — sem isso, quem não está com o chat aberto nunca vê o check azul'
  );
  // Nunca manda para a sala do próprio leitor (ele não tem checks a atualizar).
  assert.ok(!salas.includes('user:BOB'));
});

test('markDelivered também avisa a sala pessoal do remetente', async () => {
  const messages = [fakeMessage(1, 'ALICE')];
  const db = fakeDb({ messages, users: [] });
  const io = fakeIo();

  await markDelivered({ db, io, conversationId: 7, recipientId: 'BOB' });
  const salas = io.emitted.map((e) => e.room);
  assert.ok(salas.includes('chat_7'));
  assert.ok(salas.includes('user:ALICE'));
});

test('transição completa sent → delivered → read grava status e carimbos', async () => {
  const msg = fakeMessage(1, 'ALICE');
  const db = fakeDb({
    messages: [msg],
    users: [{ id: 'ALICE', modo_discreto: false }, { id: 'BOB', modo_discreto: false }],
  });
  const io = fakeIo();

  assert.equal(msg.status, 'sent');
  assert.equal(msg.delivered_at, null);

  await markDelivered({ db, io, conversationId: 7, recipientId: 'BOB' });
  assert.equal(msg.status, 'delivered');
  assert.ok(msg.delivered_at, 'carimba a entrega');
  assert.equal(msg.read_at, null, 'ainda não foi lida');

  await markRead({ db, io, conversationId: 7, readerId: 'BOB', otherUserId: 'ALICE' });
  assert.equal(msg.status, 'read');
  assert.ok(msg.read_at, 'carimba a leitura');
});
