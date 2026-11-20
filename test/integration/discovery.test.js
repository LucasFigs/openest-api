// Integração REAL (PostgreSQL): a Descoberta nunca devolve quem já foi
// processado e curtir/passar de novo é idempotente (sem o 400 "Você já curtiu
// este perfil." que abria a tela vermelha no app).
//   node --test test/integration/discovery.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/models');
const userController = require('../../src/controllers/userController');
const interactionController = require('../../src/controllers/interactionController');

const fakeIo = () => ({ to: () => ({ emit: () => {} }) });
const mockRes = () => ({
  statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
});
const mockReq = (userId, { params = {}, query = {} } = {}) => ({
  user: { id: userId }, params, query, body: {}, app: { get: () => fakeIo() },
});

async function criarUsuarios(qtd) {
  const sufixo = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return Promise.all(
    Array.from({ length: qtd }, (_, i) => db.User.create({
      email: `disc-${i}-${sufixo}@teste.local`, password_hash: 'x', name: `Disc ${i}`,
    })),
  );
}

async function limpar(usuarios) {
  const ids = usuarios.map((u) => u.id);
  const { Op } = db.Sequelize;
  const matches = await db.Match.findAll({
    where: { [Op.or]: [{ user1_id: ids }, { user2_id: ids }] },
  });
  const matchIds = matches.map((m) => m.id);
  if (matchIds.length) {
    await db.Conversation.destroy({ where: { match_id: matchIds } });
    await db.Match.destroy({ where: { id: matchIds } });
  }
  await db.Interaction.destroy({
    where: { [Op.or]: [{ from_user_id: ids }, { to_user_id: ids }] },
  });
  await db.User.destroy({ where: { id: ids }, force: true });
}

const curtir = async (de, para) => {
  const res = mockRes();
  await interactionController.curtirPerfil(mockReq(de.id, { params: { usuarioId: para.id } }), res);
  return res;
};
const passar = async (de, para) => {
  const res = mockRes();
  await interactionController.passarPerfil(mockReq(de.id, { params: { usuarioId: para.id } }), res);
  return res;
};

test('curtir de novo é idempotente: 200, sem linha duplicada', async () => {
  const usuarios = await criarUsuarios(2);
  const [eu, ela] = usuarios;
  try {
    const primeira = await curtir(eu, ela);
    assert.equal(primeira.statusCode, 201);
    assert.equal(primeira.body.match, false);

    const repetida = await curtir(eu, ela);
    assert.equal(repetida.statusCode, 200);
    assert.equal(repetida.body.ja_curtiu, true);
    assert.equal(repetida.body.match, false);

    const total = await db.Interaction.count({ where: { from_user_id: eu.id, to_user_id: ela.id, type: 'like' } });
    assert.equal(total, 1);
  } finally {
    await limpar(usuarios);
  }
});

test('curtida repetida devolve o match existente sem criar outro', async () => {
  const usuarios = await criarUsuarios(2);
  const [eu, ela] = usuarios;
  try {
    await curtir(ela, eu);
    const match = await curtir(eu, ela);
    assert.equal(match.body.match, true);

    const repetida = await curtir(eu, ela);
    assert.equal(repetida.statusCode, 200);
    assert.equal(repetida.body.match, true);

    const { Op } = db.Sequelize;
    const matches = await db.Match.count({
      where: { [Op.or]: [{ user1_id: eu.id, user2_id: ela.id }, { user1_id: ela.id, user2_id: eu.id }] },
    });
    assert.equal(matches, 1);
  } finally {
    await limpar(usuarios);
  }
});

test('passar de novo é idempotente: 200, sem linha duplicada', async () => {
  const usuarios = await criarUsuarios(2);
  const [eu, ele] = usuarios;
  try {
    assert.equal((await passar(eu, ele)).statusCode, 201);
    const repetida = await passar(eu, ele);
    assert.equal(repetida.statusCode, 200);
    assert.equal(repetida.body.ja_passou, true);
    const total = await db.Interaction.count({ where: { from_user_id: eu.id, to_user_id: ele.id, type: 'pass' } });
    assert.equal(total, 1);
  } finally {
    await limpar(usuarios);
  }
});

test('Descoberta exclui curtidos, passados, matches (mesmo sem interação) e o próprio usuário', async () => {
  const usuarios = await criarUsuarios(5);
  const [eu, curtido, passado, matchSemInteracao, livre] = usuarios;
  try {
    await curtir(eu, curtido);
    await passar(eu, passado);
    // Match que sobrou de uma curtida desfeita (a conversa tinha mensagens).
    await db.Match.create({ user1_id: matchSemInteracao.id, user2_id: eu.id });

    const ids = await userController.idsJaProcessados(eu.id);
    for (const u of [eu, curtido, passado, matchSemInteracao]) {
      assert.ok(ids.includes(u.id), `${u.name} deveria estar excluído`);
    }
    assert.ok(!ids.includes(livre.id));

    // A rota real também não devolve nenhum deles (página máxima; os criados agora vêm primeiro).
    const res = mockRes();
    await userController.buscarPerfis(mockReq(eu.id, { query: { limit: 100 } }), res);
    assert.equal(res.statusCode, 200);
    const devolvidos = res.body.perfis.map((p) => p.id);
    for (const u of [eu, curtido, passado, matchSemInteracao]) {
      assert.ok(!devolvidos.includes(u.id), `${u.name} não pode voltar na Descoberta`);
    }
    assert.ok(devolvidos.includes(livre.id), 'perfil sem interação continua aparecendo');
  } finally {
    await limpar(usuarios);
  }
});

test('curtidas e passes simultâneos (toque duplo) gravam uma linha só', async () => {
  const usuarios = await criarUsuarios(3);
  const [eu, ela, ele] = usuarios;
  try {
    const curtidas = await Promise.all(Array.from({ length: 5 }, () => curtir(eu, ela)));
    assert.deepEqual(curtidas.map((r) => r.statusCode).sort(), [200, 200, 200, 200, 201]);
    assert.equal(await db.Interaction.count({ where: { from_user_id: eu.id, to_user_id: ela.id, type: 'like' } }), 1);

    const passes = await Promise.all(Array.from({ length: 5 }, () => passar(eu, ele)));
    assert.deepEqual(passes.map((r) => r.statusCode).sort(), [200, 200, 200, 200, 201]);
    assert.equal(await db.Interaction.count({ where: { from_user_id: eu.id, to_user_id: ele.id, type: 'pass' } }), 1);
  } finally {
    await limpar(usuarios);
  }
});

test('curtidas recíprocas no mesmo instante criam 1 match e 1 conversa', async () => {
  const { Op } = db.Sequelize;
  for (let rodada = 0; rodada < 3; rodada += 1) {
    const usuarios = await criarUsuarios(2);
    const [a, b] = usuarios;
    try {
      const [ra, rb] = await Promise.all([curtir(a, b), curtir(b, a)]);
      // Exatamente um dos dois "fecha" o match.
      assert.equal([ra.body.match, rb.body.match].filter(Boolean).length, 1);
      const matches = await db.Match.findAll({
        where: { [Op.or]: [{ user1_id: a.id, user2_id: b.id }, { user1_id: b.id, user2_id: a.id }] },
      });
      assert.equal(matches.length, 1);
      assert.equal(await db.Conversation.count({ where: { match_id: matches[0].id } }), 1);
    } finally {
      await limpar(usuarios);
    }
  }
});

test('alvo inválido: id malformado → 400, inexistente → 404, a si mesmo → 400 (nada gravado)', async () => {
  const usuarios = await criarUsuarios(1);
  const [eu] = usuarios;
  try {
    for (const acao of [interactionController.curtirPerfil, interactionController.passarPerfil]) {
      const malformado = mockRes();
      await acao(mockReq(eu.id, { params: { usuarioId: 'nao-e-uuid' } }), malformado);
      assert.equal(malformado.statusCode, 400);

      const inexistente = mockRes();
      await acao(mockReq(eu.id, { params: { usuarioId: '00000000-0000-4000-8000-000000000000' } }), inexistente);
      assert.equal(inexistente.statusCode, 404);

      const proprio = mockRes();
      await acao(mockReq(eu.id, { params: { usuarioId: eu.id } }), proprio);
      assert.equal(proprio.statusCode, 400);
    }
    const desfazer = mockRes();
    await interactionController.desfazerInteracao(mockReq(eu.id, { params: { usuarioId: 'xyz' } }), desfazer);
    assert.equal(desfazer.statusCode, 400);
    assert.equal(await db.Interaction.count({ where: { from_user_id: eu.id } }), 0);
  } finally {
    await limpar(usuarios);
  }
});

test('buscar com paginação/idade inválidas usa o padrão em vez de 500', async () => {
  const usuarios = await criarUsuarios(1);
  const [eu] = usuarios;
  try {
    const res = mockRes();
    await userController.buscarPerfis(
      mockReq(eu.id, { query: { page: '-3', limit: 'abc', idade_min: 'x', idade_max: '' } }), res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.pagina_atual, 1);
    assert.ok(res.body.perfis.length <= 10);

    const grande = mockRes();
    await userController.buscarPerfis(mockReq(eu.id, { query: { limit: '999999' } }), grande);
    assert.equal(grande.statusCode, 200);
    assert.ok(grande.body.perfis.length <= 100, 'limit tem teto');
  } finally {
    await limpar(usuarios);
  }
});

test.after(async () => {
  await db.sequelize.close();
});
