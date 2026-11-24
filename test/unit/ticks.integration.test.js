// Ciclo de status estilo WhatsApp com Socket.IO REAL (servidor + 2 clientes).
// Banco falso em memória, mas com o mesmo contrato do Sequelize usado pelo
// serviço de status. Nada aqui depende de reiniciar o servidor nem de refresh.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { io: connectClient } = require('socket.io-client');
const { Op } = require('sequelize');
const { setupSocket } = require('../../src/socket');

const SECRET = 'segredo-de-teste';
const ANA = 'user-ana';     // remetente
const BRUNO = 'user-bruno'; // destinatario
const CONV = 10;

// --- banco falso ----------------------------------------------------------
function createDb(estado) {
  const participa = (userId) => userId === ANA || userId === BRUNO;
  return {
    Sequelize: { Op },
    Message: {
      create: async (data) => {
        const msg = {
          id: estado.messages.length + 1, delivered_at: null, read_at: null, ...data,
          async update(patch) { Object.assign(this, patch); },
        };
        estado.messages.push(msg);
        return msg;
      },
      findAll: async ({ where }) => {
        const ne = where.sender_id[Op.ne];
        return estado.messages.filter(
          (m) => String(m.conversation_id) === String(where.conversation_id) && m.sender_id !== ne
        );
      },
    },
    User: {
      findByPk: async (id) => ({ name: id === ANA ? 'Ana' : 'Bruno' }),
      findAll: async ({ where }) =>
        where.id.filter(participa).map((id) => ({ id, modo_discreto: estado.discreto[id] === true })),
    },
    // Emula o UPDATE ... RETURNING do resyncDelivered.
    sequelize: {
      query: async (_sql, { replacements }) => {
        const { userId } = replacements;
        const alvo = estado.messages.filter((m) => m.sender_id !== userId && m.status === 'sent');
        for (const m of alvo) { m.status = 'delivered'; m.delivered_at = new Date(); }
        return [alvo.map((m) => ({ id: m.id, sender_id: m.sender_id, conversation_id: m.conversation_id }))];
      },
    },
  };
}

function createDeps(estado) {
  return {
    logger: { log() {}, error() {} },
    verifyToken: async (token) => jwt.verify(token, SECRET),
    db: createDb(estado),
    notifications: {
      getConversationAccess: async (conversationId, userId) => {
        if (String(conversationId) !== String(CONV)) return null;
        if (userId === ANA) return { otherUserId: BRUNO };
        if (userId === BRUNO) return { otherUserId: ANA };
        return null;
      },
      notifyNewMessage: async () => {},
    },
  };
}

async function startServer(estado) {
  const httpServer = http.createServer();
  const io = new Server(httpServer);
  setupSocket(io, createDeps(estado));
  await new Promise((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address();
  return {
    port,
    close: async () => { io.close(); await new Promise((r) => httpServer.close(r)); },
  };
}

const conectar = (port, userId) =>
  new Promise((resolve, reject) => {
    const c = connectClient(`http://localhost:${port}`, {
      auth: { token: jwt.sign({ id: userId }, SECRET) },
      transports: ['websocket'], forceNew: true,
    });
    c.on('connect', () => resolve(c));
    c.on('connect_error', reject);
  });

const emitir = (socket, evento, payload) =>
  new Promise((resolve) => socket.emit(evento, payload, resolve));

// Espera um `message_status_updated` com o status pedido (com timeout claro).
const esperarStatus = (socket, status, ms = 3000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout esperando status "${status}"`)), ms);
    const handler = (payload) => {
      if (payload.status === status) {
        clearTimeout(t); socket.off('message_status_updated', handler); resolve(payload);
      }
    };
    socket.on('message_status_updated', handler);
  });

const novoEstado = () => ({ messages: [], discreto: { [ANA]: false, [BRUNO]: false } });

// Coleta TODOS os status recebidos, desde antes da acao (evita corrida).
const coletarStatus = (socket) => {
  const recebidos = [];
  socket.on('message_status_updated', (p) => recebidos.push(p));
  return recebidos;
};
const descansar = (ms = 400) => new Promise((r) => setTimeout(r, ms));

// --- 1. ciclo completo ----------------------------------------------------
test('ciclo em tempo real: sent (1 check) -> delivered (2 cinzas) -> read (2 azuis)', async () => {
  const estado = novoEstado();
  const srv = await startServer(estado);
  const ana = await conectar(srv.port, ANA);
  const bruno = await conectar(srv.port, BRUNO); // online, mas SEM abrir a conversa
  try {
    await emitir(ana, 'join_conversation', CONV);

    // (2) sent — a API salva e confirma no ack
    const entregue = esperarStatus(ana, 'delivered');
    const ack = await emitir(ana, 'send_message', { conversation_id: CONV, content: 'oi' });
    assert.equal(ack.ok, true);
    assert.equal(ack.message.status, 'sent', '1 check assim que salva');

    // (3) delivered — Bruno esta conectado, mesmo sem a conversa aberta
    const pd = await entregue;
    assert.equal(pd.status, 'delivered');
    assert.ok(pd.message_ids.includes(ack.message.id));

    // (4) read — Bruno abre a conversa
    const lido = esperarStatus(ana, 'read');
    await emitir(bruno, 'join_conversation', CONV);
    const pr = await lido;
    assert.equal(pr.status, 'read');
    assert.equal(pr.read_receipts_blocked, false);
    assert.equal(estado.messages[0].status, 'read');
    assert.ok(estado.messages[0].read_at, 'carimba a leitura');
  } finally {
    ana.close(); bruno.close(); await srv.close();
  }
});

// --- 2. resync na reconexao ----------------------------------------------
test('usuario offline reconecta e as mensagens sent viram delivered sozinhas', async () => {
  const estado = novoEstado();
  const srv = await startServer(estado);
  const ana = await conectar(srv.port, ANA);
  let bruno;
  try {
    await emitir(ana, 'join_conversation', CONV);

    // Bruno OFFLINE: a mensagem fica em `sent` (1 check).
    const ack = await emitir(ana, 'send_message', { conversation_id: CONV, content: 'ola' });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(estado.messages[0].status, 'sent', 'ninguem recebeu ainda');

    // Bruno conecta -> o resync marca tudo como entregue e avisa a Ana.
    const entregue = esperarStatus(ana, 'delivered');
    bruno = await conectar(srv.port, BRUNO);
    const payload = await entregue;

    assert.equal(payload.status, 'delivered');
    assert.ok(payload.message_ids.includes(ack.message.id));
    assert.equal(estado.messages[0].status, 'delivered', 'persistiu como entregue');
  } finally {
    ana.close(); if (bruno) bruno.close(); await srv.close();
  }
});

// --- 3. trava reciproca do Modo Discreto ---------------------------------
// Com Modo Discreto o status NUNCA pode chegar a `read`: nem no banco, nem
// como evento para o remetente. O teto e `delivered` (2 checks cinzas).
async function cenarioDiscreto(quemEstaDiscreto) {
  const estado = novoEstado();
  estado.discreto[quemEstaDiscreto] = true;
  const srv = await startServer(estado);
  const ana = await conectar(srv.port, ANA);
  const bruno = await conectar(srv.port, BRUNO);
  try {
    await emitir(ana, 'join_conversation', CONV);
    await emitir(ana, 'send_message', { conversation_id: CONV, content: 'oi' });
    await descansar(200);

    // Volta para `sent` para que o mark_read tenha de fato o que atualizar.
    estado.messages[0].status = 'sent';
    estado.messages[0].delivered_at = null;

    const recebidos = coletarStatus(ana);
    await emitir(bruno, 'join_conversation', CONV);
    await emitir(bruno, 'mark_messages_read', { conversation_id: CONV });
    await descansar();

    // O remetente nunca ve azul.
    assert.ok(
      !recebidos.some((p) => p.status === 'read'),
      'nenhum evento `read` pode chegar com Modo Discreto ligado'
    );
    assert.ok(
      recebidos.some((p) => p.status === 'delivered' && p.read_receipts_blocked === true),
      'o remetente recebe `delivered` sinalizado como bloqueado'
    );
    // E o banco tambem para em entregue.
    assert.equal(estado.messages[0].status, 'delivered', 'nunca chega a read');
    assert.equal(estado.messages[0].read_at, null, 'nao carimba leitura');
  } finally {
    ana.close(); bruno.close(); await srv.close();
  }
}

test('Modo Discreto do DESTINATARIO bloqueia os 2 checks azuis', async () => {
  await cenarioDiscreto(BRUNO);
});

test('Modo Discreto do REMETENTE tambem bloqueia (regra reciproca)', async () => {
  await cenarioDiscreto(ANA);
});

// --- 4. ACK de entrega vindo do cliente ----------------------------------
test('message_delivered_ack do cliente marca entregue e avisa o remetente', async () => {
  const estado = novoEstado();
  const srv = await startServer(estado);
  const ana = await conectar(srv.port, ANA);
  const bruno = await conectar(srv.port, BRUNO);
  try {
    await emitir(ana, 'join_conversation', CONV);
    const msg = await emitir(ana, 'send_message', { conversation_id: CONV, content: 'oi' });
    estado.messages[0].status = 'sent'; // forca o cenario do ack manual

    const entregue = esperarStatus(ana, 'delivered');
    const ack = await emitir(bruno, 'message_delivered_ack', { conversation_id: CONV });
    assert.equal(ack.ok, true);
    const payload = await entregue;
    assert.ok(payload.message_ids.includes(msg.message.id));
    assert.equal(estado.messages[0].status, 'delivered');
  } finally {
    ana.close(); bruno.close(); await srv.close();
  }
});
