// T045 — integração REAL do Socket.IO: servidor + 2 clientes de verdade,
// trocando mensagens pela rede local. Banco e push são falsos (injetados).
// Critério de aceite: "Mensagens trocadas sem a necessidade de recarregar a tela".
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { io: connectClient } = require('socket.io-client');
const { setupSocket } = require('../../src/socket');

const SECRET = 'segredo-de-teste';
const ANA = 'user-ana';
const BRUNO = 'user-bruno';
const INTRUSO = 'user-intruso';
const CONVERSATION_ID = 10;

function createFakeDeps() {
  const saved = [];
  const notified = [];
  return {
    saved,
    notified,
    deps: {
      logger: { log() {}, error() {} },
      verifyToken: async (token) => jwt.verify(token, SECRET),
      db: {
        Message: {
          create: async (data) => {
            const msg = { id: saved.length + 1, ...data, createdAt: new Date().toISOString() };
            saved.push(msg);
            return msg;
          },
        },
        User: { findByPk: async (id) => ({ name: id === ANA ? 'Ana' : 'Bruno' }) },
      },
      notifications: {
        getConversationAccess: async (conversationId, userId) => {
          if (String(conversationId) !== String(CONVERSATION_ID)) return null;
          if (userId === ANA) return { otherUserId: BRUNO };
          if (userId === BRUNO) return { otherUserId: ANA };
          return null;
        },
        notifyNewMessage: async (payload) => {
          notified.push(payload);
          payload.io.to(`user_${payload.recipientId}`).emit('notification', {
            type: 'message',
            conversation_id: payload.conversationId,
          });
        },
      },
    },
  };
}

async function startServer() {
  const httpServer = http.createServer();
  const io = new Server(httpServer);
  const ctx = createFakeDeps();
  setupSocket(io, ctx.deps);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address();
  const clients = [];

  const connect = (token) =>
    new Promise((resolve, reject) => {
      const client = connectClient(`http://127.0.0.1:${port}`, {
        auth: token ? { token } : {},
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      clients.push(client);
      client.on('connect', () => resolve(client));
      client.on('connect_error', reject);
    });

  const close = async () => {
    clients.forEach((c) => c.close());
    io.close();
    await new Promise((resolve) => httpServer.close(resolve));
  };

  return { connect, close, ...ctx };
}

const tokenFor = (id) => jwt.sign({ id }, SECRET);
const waitFor = (client, event) => new Promise((resolve) => client.once(event, resolve));

test('handshake recusa token ausente ou forjado', async () => {
  const server = await startServer();
  try {
    await assert.rejects(server.connect(null), /Erro de autenticação/);
    await assert.rejects(server.connect(jwt.sign({ id: ANA }, 'outro-segredo')), /Erro de autenticação/);
  } finally {
    await server.close();
  }
});

test('Ana e Bruno trocam mensagens em tempo real pela sala da conversa', async () => {
  const server = await startServer();
  try {
    const ana = await server.connect(tokenFor(ANA));
    const bruno = await server.connect(tokenFor(BRUNO));

    assert.deepEqual(await ana.timeout(2000).emitWithAck('join_conversation', CONVERSATION_ID), { ok: true });
    assert.deepEqual(await bruno.timeout(2000).emitWithAck('join_conversation', CONVERSATION_ID), { ok: true });

    const brunoReceives = waitFor(bruno, 'new_message');
    const anaEcho = waitFor(ana, 'new_message');
    const ack = await ana.timeout(2000).emitWithAck('send_message', {
      conversation_id: CONVERSATION_ID,
      content: 'Oi Bruno!',
      sender_id: INTRUSO, // tentativa de se passar por outra pessoa — deve ser ignorada
    });

    assert.equal(ack.ok, true);
    const received = await brunoReceives;
    assert.equal(received.content, 'Oi Bruno!');
    assert.equal(received.sender_id, ANA);
    assert.equal(received.id, ack.message.id);
    assert.equal((await anaEcho).id, ack.message.id); // o app usa o eco para confirmar a bolha
    assert.equal(server.saved.length, 1);
  } finally {
    await server.close();
  }
});

test('destinatário fora do chat recebe o aviso na sala pessoal (base do push/notificação)', async () => {
  const server = await startServer();
  try {
    const ana = await server.connect(tokenFor(ANA));
    const bruno = await server.connect(tokenFor(BRUNO)); // Bruno NÃO entrou na sala da conversa
    await ana.timeout(2000).emitWithAck('join_conversation', CONVERSATION_ID);

    const notification = waitFor(bruno, 'notification');
    await ana.timeout(2000).emitWithAck('send_message', { conversation_id: CONVERSATION_ID, content: 'Tá aí?' });

    assert.deepEqual(await notification, { type: 'message', conversation_id: CONVERSATION_ID });
    assert.equal(server.notified[0].recipientId, BRUNO);
    assert.equal(server.notified[0].senderName, 'Ana');
  } finally {
    await server.close();
  }
});

test('quem não participa do match não entra na sala nem envia', async () => {
  const server = await startServer();
  try {
    const intruso = await server.connect(tokenFor(INTRUSO));

    const join = await intruso.timeout(2000).emitWithAck('join_conversation', CONVERSATION_ID);
    const send = await intruso.timeout(2000).emitWithAck('send_message', { conversation_id: CONVERSATION_ID, content: 'spam' });

    assert.equal(join.ok, false);
    assert.equal(send.ok, false);
    assert.equal(server.saved.length, 0);
  } finally {
    await server.close();
  }
});

test('depois de sair da sala, não recebe mais as mensagens da conversa', async () => {
  const server = await startServer();
  try {
    const ana = await server.connect(tokenFor(ANA));
    const bruno = await server.connect(tokenFor(BRUNO));
    await ana.timeout(2000).emitWithAck('join_conversation', CONVERSATION_ID);
    await bruno.timeout(2000).emitWithAck('join_conversation', CONVERSATION_ID);

    bruno.emit('leave_conversation', CONVERSATION_ID);
    await new Promise((resolve) => setTimeout(resolve, 50));

    let brunoGotIt = false;
    bruno.on('new_message', () => { brunoGotIt = true; });
    await ana.timeout(2000).emitWithAck('send_message', { conversation_id: CONVERSATION_ID, content: 'só pra Ana' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(brunoGotIt, false);
  } finally {
    await server.close();
  }
});

test('T046: "digitando…" chega só para o outro participante, com o id do token', async () => {
  const server = await startServer();
  try {
    const ana = await server.connect(tokenFor(ANA));
    const bruno = await server.connect(tokenFor(BRUNO));
    await ana.timeout(2000).emitWithAck('join_conversation', CONVERSATION_ID);
    await bruno.timeout(2000).emitWithAck('join_conversation', CONVERSATION_ID);

    let anaGotOwnTyping = false;
    ana.on('user_typing', () => { anaGotOwnTyping = true; });

    const started = waitFor(bruno, 'user_typing');
    ana.emit('typing_start', { conversation_id: CONVERSATION_ID, user_id: INTRUSO });
    assert.deepEqual(await started, { user_id: ANA, is_typing: true });

    const stopped = waitFor(bruno, 'user_typing');
    ana.emit('typing_stop', { conversation_id: CONVERSATION_ID });
    assert.deepEqual(await stopped, { user_id: ANA, is_typing: false });

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(anaGotOwnTyping, false);
  } finally {
    await server.close();
  }
});

test('T046: quem não está na sala não consegue mandar "digitando…" para a conversa', async () => {
  const server = await startServer();
  try {
    const intruso = await server.connect(tokenFor(INTRUSO));
    const bruno = await server.connect(tokenFor(BRUNO));
    await bruno.timeout(2000).emitWithAck('join_conversation', CONVERSATION_ID);

    let brunoGotTyping = false;
    bruno.on('user_typing', () => { brunoGotTyping = true; });
    intruso.emit('typing_start', { conversation_id: CONVERSATION_ID });
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(brunoGotTyping, false);
  } finally {
    await server.close();
  }
});
