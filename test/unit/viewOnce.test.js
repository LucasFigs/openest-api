// Foto de VISUALIZAÇÃO ÚNICA: abre uma vez, e nunca mais.
// Banco falso em memória: o findByPk devolve CÓPIAS (como um banco real), para
// que a trava atômica do UPDATE ... WHERE is_opened = false seja exercitada.
const test = require('node:test');
const assert = require('node:assert/strict');
const { openViewOnce, publicIdFromUrl, ViewOnceError } = require('../../src/services/viewOnce');
const { serializeMessage, classifyMessage, previewText } = require('../../src/services/messageSerializer');

const ANA = 'ana';     // remetente
const BRUNO = 'bruno'; // destinatario
const URL_FOTO = 'https://res.cloudinary.com/demo/image/upload/v1700000000/openest_uploads/abc123.jpg';

function criarCenario(extra = {}) {
  const linhas = [{
    id: 1, conversation_id: 10, sender_id: ANA, content: URL_FOTO, caption: 'olha isso',
    is_view_once: true, is_opened: false, viewed_at: null, ...extra,
  }];
  const emitidos = [];
  const destruidos = [];
  const db = {
    Message: {
      findByPk: async (id) => {
        const linha = linhas.find((m) => String(m.id) === String(id));
        return linha ? { ...linha } : null; // cópia, como um SELECT
      },
      update: async (values, { where }) => {
        const linha = linhas.find((m) => String(m.id) === String(where.id) && m.is_opened === where.is_opened);
        if (!linha) return [0];
        Object.assign(linha, values);
        return [1];
      },
    },
  };
  const io = { to: (room) => ({ emit: (event, payload) => emitidos.push({ room, event, payload }) }) };
  const getAccess = async (conversationId, userId) =>
    String(conversationId) === '10' && (userId === ANA || userId === BRUNO) ? { otherUserId: userId === ANA ? BRUNO : ANA } : null;
  const destroyMedia = async (url) => { destruidos.push(url); };
  const abrir = (userId) => openViewOnce({
    db, io, messageId: 1, userId, getAccess, destroyMedia, destroyDelayMs: 0, logger: { error() {} },
  });
  return { linhas, emitidos, destruidos, abrir };
}

const esperar = (ms = 10) => new Promise((r) => setTimeout(r, ms));

test('o destinatário abre UMA vez: recebe a URL e a mensagem vira "aberta"', async () => {
  const c = criarCenario();
  const res = await c.abrir(BRUNO);

  assert.equal(res.url, URL_FOTO, 'a URL é entregue na abertura');
  assert.equal(res.caption, 'olha isso');
  assert.equal(c.linhas[0].is_opened, true);
  assert.ok(c.linhas[0].viewed_at, 'carimba viewed_at');
  assert.notEqual(c.linhas[0].content, URL_FOTO, 'a URL sai do banco');
  assert.equal(c.linhas[0].caption, null);
});

test('segunda abertura é BLOQUEADA (410) e não devolve URL', async () => {
  const c = criarCenario();
  await c.abrir(BRUNO);
  await assert.rejects(c.abrir(BRUNO), (err) => {
    assert.ok(err instanceof ViewOnceError);
    assert.equal(err.code, 'already_opened');
    assert.equal(err.status, 410);
    return true;
  });
});

test('dois toques AO MESMO TEMPO: só um abre (trava atômica)', async () => {
  const c = criarCenario();
  const resultados = await Promise.allSettled([c.abrir(BRUNO), c.abrir(BRUNO)]);
  const ok = resultados.filter((r) => r.status === 'fulfilled');
  const negados = resultados.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 1, 'apenas UMA abertura vence a corrida');
  assert.equal(negados.length, 1);
  assert.equal(negados[0].reason.code, 'already_opened');
});

test('quem ENVIOU não pode abrir a própria foto', async () => {
  const c = criarCenario();
  await assert.rejects(c.abrir(ANA), (err) => err.code === 'sender' && err.status === 403);
  assert.equal(c.linhas[0].is_opened, false, 'continua fechada');
});

test('quem não participa da conversa não abre', async () => {
  const c = criarCenario();
  await assert.rejects(c.abrir('intruso'), (err) => err.code === 'forbidden' && err.status === 403);
});

test('mensagem comum (não visualização única) é recusada', async () => {
  const c = criarCenario({ is_view_once: false });
  await assert.rejects(c.abrir(BRUNO), (err) => err.code === 'not_view_once');
});

test('avisa os DOIS lados em tempo real (sala da conversa + salas pessoais)', async () => {
  const c = criarCenario();
  await c.abrir(BRUNO);
  const salas = c.emitidos.filter((e) => e.event === 'message_view_once_opened').map((e) => e.room);
  assert.ok(salas.includes('chat_10'));
  assert.ok(salas.includes(`user:${ANA}`), 'o remetente vê "Aberta" na hora');
  assert.ok(salas.includes(`user:${BRUNO}`));
  assert.equal(c.emitidos[0].payload.message_id, 1);
});

test('o arquivo é apagado da nuvem depois da abertura', async () => {
  const c = criarCenario();
  await c.abrir(BRUNO);
  await esperar();
  assert.deepEqual(c.destruidos, [URL_FOTO]);
});

test('publicIdFromUrl extrai o id do Cloudinary', () => {
  assert.equal(publicIdFromUrl(URL_FOTO), 'openest_uploads/abc123');
  assert.equal(publicIdFromUrl('https://res.cloudinary.com/x/image/upload/openest_uploads/y.png'), 'openest_uploads/y');
  assert.equal(publicIdFromUrl('lixo'), null);
});

// --- serialização: a URL nunca vaza fora da abertura -----------------------
test('serializeMessage esconde a URL e a legenda da visualização única', () => {
  const saida = serializeMessage({ id: 1, content: URL_FOTO, caption: 'oi', is_view_once: true, is_opened: false });
  assert.equal(saida.content, null);
  assert.equal(saida.caption, null);
  assert.equal(saida.media_type, 'image');
  assert.equal(saida.is_view_once, true);
});

test('serializeMessage não mexe em mensagem comum', () => {
  const saida = serializeMessage({ id: 2, content: 'oi', is_view_once: false });
  assert.equal(saida.content, 'oi');
});

test('prévia da lista: tipo e texto de cada mensagem', () => {
  assert.equal(classifyMessage({ content: URL_FOTO }), 'image');
  assert.equal(previewText({ content: URL_FOTO }), 'Foto');
  assert.equal(previewText({ content: URL_FOTO, caption: 'praia' }), 'praia');
  assert.equal(classifyMessage({ content: URL_FOTO, is_view_once: true }), 'view_once');
  assert.equal(previewText({ content: null, is_view_once: true, is_opened: true }), 'Foto aberta');
  assert.equal(classifyMessage({ content: '📍 Localização partilhada:\nhttp://maps.google.com/maps?q=1,2' }), 'location');
  assert.equal(previewText({ content: '[CONVITE_EVENTO]{"titulo":"x"}' }), 'Convite de encontro');
  assert.equal(previewText({ content: '🚫 Mensagem apagada' }), 'Mensagem apagada');
  assert.equal(previewText({ content: 'bom dia' }), 'bom dia');
});
