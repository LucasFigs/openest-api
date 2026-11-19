// Integração REAL (PostgreSQL): "Desistir" precisa persistir.
// O bug: o card sumia da tela mas voltava no refresh. Estes testes chamam os
// controllers de verdade e conferem o GET seguinte, como a tela faz.
//
//   node --test test/integration/desistir.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/models');
const { meusEncontros, cancelarEvento } = require('../../src/controllers/eventController');

const q = (sql, replacements) =>
  db.sequelize.query(sql, { replacements, type: db.sequelize.QueryTypes.SELECT });

// req/res de mentira, no formato que o Express entrega aos controllers.
const mockRes = () => ({
  statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
});
const mockReq = (userId, params = {}, body = {}) => ({
  user: { id: userId }, params, body, query: {},
  app: { get: () => null }, // sem socket.io neste teste
});

const listar = async (userId) => {
  const res = mockRes();
  await meusEncontros(mockReq(userId), res);
  assert.equal(res.statusCode, 200);
  return res.body;
};
const desistir = async (userId, id, body = {}) => {
  const res = mockRes();
  await cancelarEvento(mockReq(userId, { id }, body), res);
  return res;
};

// Cria um par de usuários descartáveis + match + conversa.
async function criarCenario(tag) {
  const sufixo = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const [a, b] = await Promise.all([
    db.User.create({ email: `desistir-a-${tag}-${sufixo}@teste.local`, password_hash: 'x', name: `A ${tag}` }),
    db.User.create({ email: `desistir-b-${tag}-${sufixo}@teste.local`, password_hash: 'x', name: `B ${tag}` }),
  ]);
  const match = await db.Match.create({ user1_id: a.id, user2_id: b.id });
  const conversa = await db.Conversation.create({ match_id: match.id });
  return { a, b, match, conversa };
}

async function limpar(cenario) {
  if (!cenario) return;
  const { a, b, match, conversa } = cenario;
  await q(`DELETE FROM scheduled_events WHERE created_by IN (:ids) OR other_user_id IN (:ids)`, { ids: [a.id, b.id] });
  if (conversa) await db.Conversation.destroy({ where: { id: conversa.id } });
  if (match) await db.Match.destroy({ where: { id: match.id } });
  await db.User.destroy({ where: { id: [a.id, b.id] }, force: true });
}

test('desistir de um encontro AGENDADO persiste e não volta no GET seguinte', async () => {
  const c = await criarCenario('sched');
  try {
    // Encontro agendado entre os dois.
    const [linhas] = await db.sequelize.query(
      `INSERT INTO scheduled_events (created_by, other_user_id, conversation_id, titulo, scheduled_at, local)
       VALUES (:a, :b, :conv, 'Café', NOW() + interval '1 day', 'Centro') RETURNING id`,
      { replacements: { a: c.a.id, b: c.b.id, conv: c.conversa.id } }
    );
    const eventId = linhas[0].id;

    const antes = await listar(c.a.id);
    assert.equal(antes.length, 1, 'o card aparece antes de desistir');
    assert.equal(antes[0].tipo, 'agendado');

    const res = await desistir(c.a.id, `sched-${eventId}`);
    assert.equal(res.statusCode, 200, 'a API confirma a remoção');

    // O GET seguinte é o "refresh" da tela.
    const depois = await listar(c.a.id);
    assert.equal(depois.length, 0, 'NÃO pode voltar como "A combinar" no refresh');

    // E persistiu mesmo no PostgreSQL (evento e match).
    const ev = await q(`SELECT id FROM scheduled_events WHERE id = :eventId`, { eventId });
    assert.equal(ev.length, 0, 'o evento saiu do banco');
    const m = await q(`SELECT id FROM matches WHERE id = :id`, { id: c.match.id });
    assert.equal(m.length, 0, 'o match foi desfeito — senão o card volta');

    // O outro lado também não vê mais.
    assert.equal((await listar(c.b.id)).length, 0);
  } finally {
    await limpar(c);
  }
});

test('desistir de um match "A COMBINAR" persiste e não volta no GET seguinte', async () => {
  const c = await criarCenario('match');
  try {
    const antes = await listar(c.a.id);
    assert.equal(antes.length, 1);
    assert.equal(antes[0].tipo, 'match', 'card sem data = "A combinar"');

    const res = await desistir(c.a.id, `match-${c.match.id}`);
    assert.equal(res.statusCode, 200);

    const depois = await listar(c.a.id);
    assert.equal(depois.length, 0, 'antes sumia só da tela e voltava no refresh');

    const m = await q(`SELECT id FROM matches WHERE id = :id`, { id: c.match.id });
    assert.equal(m.length, 0, 'o match saiu do PostgreSQL');
  } finally {
    await limpar(c);
  }
});

test('id SEM prefixo (o que o mobile mandava) também remove de verdade', async () => {
  const c = await criarCenario('legado');
  try {
    const [linhas] = await db.sequelize.query(
      `INSERT INTO scheduled_events (created_by, other_user_id, conversation_id, titulo, scheduled_at, local)
       VALUES (:a, :b, :conv, 'Legado', NOW() + interval '1 day', 'Centro') RETURNING id`,
      { replacements: { a: c.a.id, b: c.b.id, conv: c.conversa.id } }
    );
    const eventId = linhas[0].id;

    // Era exatamente isto que falhava em silêncio: '3' em vez de 'sched-3'.
    const res = await desistir(c.a.id, String(eventId));
    assert.equal(res.statusCode, 200);
    assert.equal((await listar(c.a.id)).length, 0);
  } finally {
    await limpar(c);
  }
});

test('desistir de algo inexistente responde 404 (a tela não some à toa)', async () => {
  const c = await criarCenario('404');
  try {
    const res = await desistir(c.a.id, 'sched-99999999');
    assert.equal(res.statusCode, 404);
    // O vínculo continua lá, porque nada foi removido.
    assert.equal((await listar(c.a.id)).length, 1);
  } finally {
    await limpar(c);
  }
});

test.after(async () => { await db.sequelize.close(); });
