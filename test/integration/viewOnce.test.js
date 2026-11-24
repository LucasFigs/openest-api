// Integração REAL (PostgreSQL): visualização única e lista de conversas.
//   node --test test/integration/viewOnce.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/models');
const messageController = require('../../src/controllers/messageController');
const { listConversations } = require('../../src/controllers/conversationController');
const messageStatus = require('../../src/services/messageStatus');

const mockRes = () => ({
  statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
});
const mockReq = (userId, params = {}, extra = {}) => ({
  user: { id: userId }, params, body: {}, query: {},
  app: { get: () => null }, ...extra,
});

async function criarCenario() {
  const sufixo = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const [ana, bruno] = await Promise.all([
    db.User.create({ email: `vo-ana-${sufixo}@teste.local`, password_hash: 'x', name: 'Ana VO' }),
    db.User.create({ email: `vo-bruno-${sufixo}@teste.local`, password_hash: 'x', name: 'Bruno VO' }),
  ]);
  const match = await db.Match.create({ user1_id: ana.id, user2_id: bruno.id });
  const conversa = await db.Conversation.create({ match_id: match.id });
  return { ana, bruno, match, conversa };
}

async function limpar(c) {
  if (!c) return;
  await db.Message.destroy({ where: { conversation_id: c.conversa.id } });
  await db.Conversation.destroy({ where: { id: c.conversa.id } });
  await db.Match.destroy({ where: { id: c.match.id } });
  await db.User.destroy({ where: { id: [c.ana.id, c.bruno.id] }, force: true });
}

const abrir = async (userId, messageId) => {
  const res = mockRes();
  await messageController.abrirVisualizacaoUnica(mockReq(userId, { id: String(messageId) }), res);
  return res;
};

test('visualização única persiste: abre uma vez e a segunda tentativa recebe 410', async () => {
  const c = await criarCenario();
  try {
    const url = 'https://exemplo.local/foto-unica.jpg'; // não-Cloudinary: nada é apagado de verdade
    const msg = await db.Message.create({
      conversation_id: c.conversa.id, sender_id: c.ana.id, content: url, is_view_once: true,
    });

    // A listagem do chat NÃO entrega a URL.
    const lista = mockRes();
    await messageController.getChatMessages(mockReq(c.bruno.id, { id: String(c.conversa.id) }), lista);
    const item = lista.body.messages.find((m) => m.id === msg.id);
    assert.equal(item.content, null, 'a URL não vaza na listagem');
    assert.equal(item.is_view_once, true);

    // Quem enviou não abre.
    assert.equal((await abrir(c.ana.id, msg.id)).statusCode, 403);

    // O destinatário abre uma vez...
    const primeira = await abrir(c.bruno.id, msg.id);
    assert.equal(primeira.statusCode, 200);
    assert.equal(primeira.body.url, url);

    // ...e nunca mais.
    const segunda = await abrir(c.bruno.id, msg.id);
    assert.equal(segunda.statusCode, 410);
    assert.equal(segunda.body.url, undefined);

    // Persistiu no PostgreSQL, e a URL saiu do banco.
    await msg.reload();
    assert.equal(msg.is_opened, true);
    assert.ok(msg.viewed_at);
    assert.notEqual(msg.content, url);
  } finally {
    await limpar(c);
  }
});

test('lista de conversas: prévia tipada, ticks e contador de não lidas', async () => {
  const c = await criarCenario();
  try {
    await db.Message.create({ conversation_id: c.conversa.id, sender_id: c.ana.id, content: 'oi' });
    await db.Message.create({
      conversation_id: c.conversa.id, sender_id: c.ana.id,
      content: 'https://res.cloudinary.com/x/image/upload/v1/openest_uploads/a.jpg', is_view_once: true,
    });

    const listar = async (userId) => {
      const res = mockRes();
      await listConversations(mockReq(userId), res);
      return res.body.find((x) => x.id === c.conversa.id);
    };

    const antes = await listar(c.bruno.id);
    assert.equal(antes.unreadCount, 2, 'duas mensagens não vistas');
    assert.equal(antes.last_message.type, 'view_once');
    assert.equal(antes.lastMessage, 'Foto de visualização única');
    assert.ok(!JSON.stringify(antes).includes('res.cloudinary.com/x'), 'a URL da foto única não vaza na lista');
    assert.equal(antes.name, 'Ana VO', 'mostra o OUTRO participante');
    assert.ok(antes.timestamp, 'horário real da última mensagem');

    // Bruno abre a conversa → zera as não lidas.
    await messageStatus.markRead({
      db, io: null, conversationId: c.conversa.id, readerId: c.bruno.id, otherUserId: c.ana.id,
    });
    assert.equal((await listar(c.bruno.id)).unreadCount, 0);

    // Para a Ana, a última é dela: ticks aparecem na lista.
    const daAna = await listar(c.ana.id);
    assert.equal(daAna.last_message.is_mine, true);
    assert.equal(daAna.last_message.status, 'read');
  } finally {
    await limpar(c);
  }
});

test('Modo Discreto não trava o contador: o visto zera mesmo sem recibo azul', async () => {
  const c = await criarCenario();
  try {
    await c.bruno.update({ modo_discreto: true });
    const msg = await db.Message.create({ conversation_id: c.conversa.id, sender_id: c.ana.id, content: 'oi' });

    await messageStatus.markRead({
      db, io: null, conversationId: c.conversa.id, readerId: c.bruno.id, otherUserId: c.ana.id,
    });
    await msg.reload();
    assert.equal(msg.status, 'delivered', 'o recibo azul continua bloqueado');
    assert.ok(msg.seen_at, 'mas o destinatário VIU — não fica como não lida para sempre');

    const res = mockRes();
    await listConversations(mockReq(c.bruno.id), res);
    assert.equal(res.body.find((x) => x.id === c.conversa.id).unreadCount, 0);
  } finally {
    await limpar(c);
  }
});

test.after(async () => { await db.sequelize.close(); });
