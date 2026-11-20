// Integração REAL (PostgreSQL): resposta com citação e "Encontro marcado".
//   node --test test/integration/replies.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/models');
const messageController = require('../../src/controllers/messageController');
const { MEETING_TAG } = require('../../src/services/messageSerializer');

const fakeIo = () => {
  const emitted = [];
  return { emitted, to: () => ({ emit: (event, payload) => emitted.push({ event, payload }) }) };
};
const mockRes = () => ({
  statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
});
const mockReq = (user, { params = {}, body = {}, io = fakeIo() } = {}) => ({
  user, params, body, query: {}, app: { get: () => io },
});

async function criarCenario(prefixo) {
  const sufixo = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const [ana, bruno] = await Promise.all([
    db.User.create({ email: `${prefixo}-ana-${sufixo}@teste.local`, password_hash: 'x', name: 'Ana RT' }),
    db.User.create({ email: `${prefixo}-bruno-${sufixo}@teste.local`, password_hash: 'x', name: 'Bruno RT' }),
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

const historico = async (c, userId) => {
  const res = mockRes();
  await messageController.getChatMessages(
    mockReq({ id: userId }, { params: { id: String(c.conversa.id) } }), res,
  );
  return res.body.messages;
};

test('resposta salva reply_to_id e devolve reply_to no envio, no socket e no histórico', async () => {
  const c = await criarCenario('rt');
  try {
    const original = await db.Message.create({
      conversation_id: c.conversa.id, sender_id: c.bruno.id, content: 'Bora no sábado?',
    });

    const io = fakeIo();
    const res = mockRes();
    await messageController.sendMessage(mockReq({ id: c.ana.id, name: 'Ana RT' }, {
      io, body: { conversation_id: c.conversa.id, content: 'Sábado sim!', reply_to_id: original.id },
    }), res);

    assert.equal(res.statusCode, 201);
    const esperado = { id: original.id, sender_id: c.bruno.id, sender_name: 'Bruno RT', type: 'text', content: 'Bora no sábado?' };
    assert.deepEqual(res.body.reply_to, esperado);
    assert.equal(res.body.reply_to_id, original.id);

    const evento = io.emitted.find((e) => e.event === 'new_message');
    assert.deepEqual(evento.payload.reply_to, esperado, 'new_message do socket já leva a citação');

    const salva = (await historico(c, c.bruno.id)).find((m) => m.id === res.body.id);
    assert.deepEqual(salva.reply_to, esperado, 'histórico devolve a citação');
    assert.equal(salva.replyTo, undefined);
  } finally {
    await limpar(c);
  }
});

test('citar mensagem de OUTRA conversa é ignorado (sem vazar conteúdo)', async () => {
  const c1 = await criarCenario('rt1');
  const c2 = await criarCenario('rt2');
  try {
    const alheia = await db.Message.create({
      conversation_id: c2.conversa.id, sender_id: c2.bruno.id, content: 'segredo de outra conversa',
    });
    const res = mockRes();
    await messageController.sendMessage(mockReq({ id: c1.ana.id }, {
      body: { conversation_id: c1.conversa.id, content: 'oi', reply_to_id: alheia.id },
    }), res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.reply_to_id, null);
    assert.ok(!JSON.stringify(res.body).includes('segredo'));
  } finally {
    await limpar(c1);
    await limpar(c2);
  }
});

test('aceitar convite vira "Encontro marcado" com data e local preservados', async () => {
  const c = await criarCenario('enc');
  try {
    const convite = await db.Message.create({
      conversation_id: c.conversa.id,
      sender_id: c.ana.id,
      content: `[CONVITE_EVENTO]${JSON.stringify({
        titulo: 'Café', scheduled_at: '2026-11-22T19:00:00.000Z', local: 'Dragão do Mar',
      })}`,
    });

    // Quem enviou não responde o próprio convite.
    const proprio = mockRes();
    await messageController.responderConvite(mockReq({ id: c.ana.id }, {
      params: { id: String(convite.id) }, body: { resposta: 'aceite' },
    }), proprio);
    assert.equal(proprio.statusCode, 403);

    const io = fakeIo();
    const res = mockRes();
    await messageController.responderConvite(mockReq({ id: c.bruno.id }, {
      io, params: { id: String(convite.id) }, body: { resposta: 'aceite' },
    }), res);
    assert.equal(res.statusCode, 200);

    await convite.reload();
    assert.ok(convite.content.startsWith(MEETING_TAG));

    const evento = io.emitted.find((e) => e.event === 'invite_updated');
    assert.equal(evento.payload.meeting.local, 'Dragão do Mar');

    const item = (await historico(c, c.ana.id)).find((m) => m.id === convite.id);
    assert.deepEqual(item.meeting, { titulo: 'Café', scheduled_at: '2026-11-22T19:00:00.000Z', local: 'Dragão do Mar' });
  } finally {
    await limpar(c);
  }
});
