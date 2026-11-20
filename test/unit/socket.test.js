// T045 — protocolo do Socket.IO (auth por JWT, salas, envio com ack).
// Usa fakes de io/socket: nada de banco nem rede.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupSocket } = require('../../src/socket');

const silentLogger = { log() {}, error() {} };
const flush = () => new Promise((resolve) => setImmediate(resolve));

function createFakeIo() {
  const emitted = [];
  return {
    middleware: null,
    onConnection: null,
    emitted,
    use(fn) { this.middleware = fn; },
    on(event, fn) { if (event === 'connection') this.onConnection = fn; },
    to(room) { return { emit: (event, payload) => emitted.push({ room, event, payload }) }; },
  };
}

function createFakeSocket(token) {
  const handlers = {};
  return {
    id: 'sock-1',
    handshake: { auth: token == null ? {} : { token } },
    rooms: new Set(),
    handlers,
    join(room) { this.rooms.add(room); },
    leave(room) { this.rooms.delete(room); },
    on(event, fn) { handlers[event] = fn; },
    to() { return { emit() {} }; },
  };
}

function createDeps({ access = { otherUserId: 'u2' } } = {}) {
  const created = [];
  const notified = [];
  return {
    created,
    notified,
    deps: {
      logger: silentLogger,
      verifyToken: async (token) => {
        if (token === 'valid') return { id: 'u1' };
        throw new Error('invalid');
      },
      db: {
        Message: { create: async (data) => { const msg = { id: created.length + 1, ...data }; created.push(msg); return msg; } },
        User: { findByPk: async () => ({ name: 'Ana' }) },
      },
      notifications: {
        getConversationAccess: async (conversationId, userId) =>
          (String(conversationId) === '10' && userId === 'u1' ? access : null),
        notifyNewMessage: async (payload) => { notified.push(payload); },
      },
    },
  };
}

async function connect(token = 'valid', depsOverride) {
  const io = createFakeIo();
  const ctx = depsOverride || createDeps();
  setupSocket(io, ctx.deps);
  const socket = createFakeSocket(token);
  const error = await new Promise((resolve) => io.middleware(socket, resolve));
  if (!error) io.onConnection(socket);
  return { io, socket, error, ...ctx };
}

test('recusa conexão sem token ou com JWT inválido', async () => {
  const noToken = await connect(null);
  assert.ok(noToken.error instanceof Error);

  const badToken = await connect('forjado');
  assert.ok(badToken.error instanceof Error);
  assert.equal(badToken.socket.user, undefined);
});

test('com JWT válido identifica o usuário e entra na sala pessoal', async () => {
  const { error, socket } = await connect('valid');
  assert.equal(error, undefined);
  assert.deepEqual(socket.user, { id: 'u1' });
  assert.ok(socket.rooms.has('user:u1'));
});

test('join_conversation só entra na sala se o usuário participa da conversa', async () => {
  const { socket } = await connect('valid');
  const acks = [];

  await socket.handlers.join_conversation(10, (r) => acks.push(r));
  await socket.handlers.join_conversation(99, (r) => acks.push(r));

  assert.ok(socket.rooms.has('chat_10'));
  assert.ok(!socket.rooms.has('chat_99'));
  assert.deepEqual(acks, [{ ok: true }, { ok: false, error: 'Conversa não encontrada' }]);
});

test('join_conversation funciona sem ack (compatível com o web)', async () => {
  const { socket } = await connect('valid');
  await socket.handlers.join_conversation(10);
  assert.ok(socket.rooms.has('chat_10'));
});

test('leave_conversation sai da sala', async () => {
  const { socket } = await connect('valid');
  await socket.handlers.join_conversation(10);
  socket.handlers.leave_conversation(10);
  assert.ok(!socket.rooms.has('chat_10'));
});

test('send_message salva com o id do TOKEN (ignora sender_id forjado), transmite e confirma', async () => {
  const { socket, io, created, notified } = await connect('valid');
  let ack;

  await socket.handlers.send_message(
    { conversation_id: 10, content: '  Oi!  ', sender_id: 'hacker' },
    (r) => { ack = r; }
  );
  await flush();

  assert.equal(created.length, 1);
  assert.equal(created[0].sender_id, 'u1');
  assert.equal(created[0].content, 'Oi!');
  assert.deepEqual(io.emitted, [{ room: 'chat_10', event: 'new_message', payload: created[0] }]);
  assert.equal(ack.ok, true);
  assert.equal(ack.message.id, created[0].id);
  assert.equal(notified.length, 1);
  assert.equal(notified[0].recipientId, 'u2');
  assert.equal(notified[0].senderName, 'Ana');
});

test('send_message recusa mensagem vazia e conversa de terceiros', async () => {
  const { socket, created } = await connect('valid');
  const acks = [];

  await socket.handlers.send_message({ conversation_id: 10, content: '   ' }, (r) => acks.push(r));
  await socket.handlers.send_message({ conversation_id: 99, content: 'oi' }, (r) => acks.push(r));
  await socket.handlers.send_message(null, (r) => acks.push(r));

  assert.equal(created.length, 0);
  assert.deepEqual(acks.map((a) => a.ok), [false, false, false]);
});

test('send_message responde erro (sem derrubar o servidor) quando o banco falha', async () => {
  const ctx = createDeps();
  ctx.deps.db.Message.create = async () => { throw new Error('db down'); };
  const { socket } = await connect('valid', ctx);
  let ack;

  await socket.handlers.send_message({ conversation_id: 10, content: 'oi' }, (r) => { ack = r; });

  assert.deepEqual(ack, { ok: false, error: 'Erro ao enviar mensagem' });
});

test('falha ao notificar não gera segundo ack nem erro para quem enviou', async () => {
  const ctx = createDeps();
  ctx.deps.notifications.notifyNewMessage = async () => { throw new Error('push down'); };
  const { socket } = await connect('valid', ctx);
  const acks = [];

  await socket.handlers.send_message({ conversation_id: 10, content: 'oi' }, (r) => acks.push(r));
  await flush();

  assert.equal(acks.length, 1);
  assert.equal(acks[0].ok, true);
});

// --- Checks de leitura: quem abre OU responde, leu -------------------------
// Fake do serviço de status para observar o que o socket dispara.
function withStatusSpy() {
  const calls = [];
  const ctx = createDeps();
  ctx.deps.messageStatus = {
    MESSAGE_STATUS: { SENT: 'sent', DELIVERED: 'delivered', READ: 'read' },
    markDelivered: async (args) => { calls.push({ fn: 'markDelivered', ...args }); return { updatedIds: [] }; },
    markRead: async (args) => { calls.push({ fn: 'markRead', ...args }); return { updatedIds: [], allowRead: true }; },
    resyncDelivered: async (args) => { calls.push({ fn: 'resyncDelivered', ...args }); return { updatedIds: [] }; },
  };
  ctx.calls = calls;
  return ctx;
}

test('entrar na conversa marca como LIDA o que o usuário recebeu', async () => {
  const ctx = withStatusSpy();
  const { socket } = await connect('valid', ctx);

  await socket.handlers.join_conversation(10, () => {});
  await flush();

  const read = ctx.calls.find((c) => c.fn === 'markRead');
  assert.ok(read, 'join_conversation precisa marcar como lido');
  assert.equal(read.readerId, 'u1');
  assert.equal(String(read.conversationId), '10');
});

test('RESPONDER na conversa garante que o recebido vire LIDO (destrava 1 check)', async () => {
  const ctx = withStatusSpy();
  const { socket } = await connect('valid', ctx);

  await socket.handlers.send_message({ conversation_id: 10, content: 'respondendo' }, () => {});
  await flush();

  const read = ctx.calls.find((c) => c.fn === 'markRead');
  assert.ok(read, 'quem responde leu o que recebeu — sem isso os checks do outro lado travam');
  assert.equal(read.readerId, 'u1');
});

test('mark_read via socket respeita a conversa e responde ack', async () => {
  const ctx = withStatusSpy();
  const { socket } = await connect('valid', ctx);

  let ack = null;
  await socket.handlers.mark_read({ conversation_id: 10 }, (r) => { ack = r; });
  assert.equal(ack.ok, true);

  let negado = null;
  await socket.handlers.mark_read({ conversation_id: 99 }, (r) => { negado = r; });
  assert.equal(negado.ok, false, 'conversa de terceiros é recusada');
});

test('mensagem nova nasce com status "sent" (1 check)', async () => {
  const ctx = withStatusSpy();
  const { socket } = await connect('valid', ctx);

  await socket.handlers.send_message({ conversation_id: 10, content: 'oi' }, () => {});
  assert.equal(ctx.created[0].status, 'sent');
});

// --- Foto de visualização única via socket ---------------------------------
test('mark_view_once_opened devolve a URL no ack (abertura única)', async () => {
  const ctx = createDeps();
  const chamadas = [];
  ctx.deps.viewOnce = {
    openViewOnce: async (args) => {
      chamadas.push(args);
      return { message_id: 5, conversation_id: 10, url: 'https://x/foto.jpg', caption: null };
    },
  };
  const { socket } = await connect('valid', ctx);

  let ack = null;
  await socket.handlers.mark_view_once_opened({ message_id: 5 }, (r) => { ack = r; });
  assert.equal(ack.ok, true);
  assert.equal(ack.url, 'https://x/foto.jpg');
  assert.equal(chamadas[0].userId, 'u1', 'o usuário vem do JWT, nunca do payload');
  assert.equal(chamadas[0].messageId, 5);
});

test('mark_view_once_opened: segunda abertura responde o código do bloqueio', async () => {
  const ctx = createDeps();
  ctx.deps.viewOnce = {
    openViewOnce: async () => {
      const err = new Error('Esta foto já foi aberta.');
      err.code = 'already_opened';
      throw err;
    },
  };
  const { socket } = await connect('valid', ctx);

  let ack = null;
  await socket.handlers.mark_view_once_opened({ message_id: 5 }, (r) => { ack = r; });
  assert.equal(ack.ok, false);
  assert.equal(ack.code, 'already_opened');
  assert.equal(ack.url, undefined, 'nunca devolve a URL de novo');
});

test('mark_view_once_opened sem id é recusado', async () => {
  const { socket } = await connect('valid');
  let ack = null;
  await socket.handlers.mark_view_once_opened({}, (r) => { ack = r; });
  assert.equal(ack.ok, false);
});
