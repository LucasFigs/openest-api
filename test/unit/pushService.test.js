// T048 — testes do envio de push pela Expo (sem rede: fetch falso).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EXPO_PUSH_URL,
  isExpoPushToken,
  buildPushMessages,
  sendPushNotifications,
} = require('../../src/services/pushService');

const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

function fakeFetch(tickets, { ok = true, status = 200 } = {}) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return { ok, status, json: async () => ({ data: typeof tickets === 'function' ? tickets(calls.length) : tickets }) };
  };
  impl.calls = calls;
  return impl;
}

test('isExpoPushToken aceita os dois formatos da Expo e recusa lixo', () => {
  assert.equal(isExpoPushToken(TOKEN_A), true);
  assert.equal(isExpoPushToken(TOKEN_B), true);
  assert.equal(isExpoPushToken('ExponentPushToken[]'), false);
  assert.equal(isExpoPushToken('fcm-token-qualquer'), false);
  assert.equal(isExpoPushToken(null), false);
  assert.equal(isExpoPushToken(123), false);
});

test('buildPushMessages remove tokens inválidos e duplicados', () => {
  const messages = buildPushMessages([TOKEN_A, TOKEN_A, 'invalido', TOKEN_B], {
    title: 'Ana',
    body: 'Oi!',
    data: { type: 'message', conversationId: '7' },
  });
  assert.equal(messages.length, 2);
  assert.deepEqual(messages.map((m) => m.to), [TOKEN_A, TOKEN_B]);
  assert.equal(messages[0].channelId, 'default');
  assert.deepEqual(messages[0].data, { type: 'message', conversationId: '7' });
});

test('sendPushNotifications não chama a rede quando não há token válido', async () => {
  const fetchImpl = fakeFetch([]);
  const result = await sendPushNotifications(['invalido'], { title: 't', body: 'b' }, { fetchImpl });
  assert.equal(fetchImpl.calls.length, 0);
  assert.deepEqual(result, { sent: 0, invalidTokens: [] });
});

test('sendPushNotifications envia para a API da Expo e conta os tickets ok', async () => {
  const fetchImpl = fakeFetch([{ status: 'ok', id: '1' }, { status: 'ok', id: '2' }]);
  const result = await sendPushNotifications([TOKEN_A, TOKEN_B], { title: 't', body: 'b' }, { fetchImpl });
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, EXPO_PUSH_URL);
  assert.equal(fetchImpl.calls[0].options.method, 'POST');
  assert.equal(result.sent, 2);
  assert.deepEqual(result.invalidTokens, []);
});

test('sendPushNotifications devolve os tokens DeviceNotRegistered para limpeza', async () => {
  const fetchImpl = fakeFetch([
    { status: 'ok', id: '1' },
    { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
  ]);
  const result = await sendPushNotifications([TOKEN_A, TOKEN_B], { title: 't', body: 'b' }, { fetchImpl });
  assert.equal(result.sent, 1);
  assert.deepEqual(result.invalidTokens, [TOKEN_B]);
});

test('sendPushNotifications nunca lança, mesmo com a rede fora do ar', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const failing = async () => { throw new Error('ECONNRESET'); };
    const result = await sendPushNotifications([TOKEN_A], { title: 't', body: 'b' }, { fetchImpl: failing });
    assert.deepEqual(result, { sent: 0, invalidTokens: [] });

    const http500 = fakeFetch([], { ok: false, status: 500 });
    const result500 = await sendPushNotifications([TOKEN_A], { title: 't', body: 'b' }, { fetchImpl: http500 });
    assert.equal(result500.sent, 0);
  } finally {
    console.error = originalError;
  }
});

test('sendPushNotifications divide em lotes de 100 (limite da Expo)', async () => {
  const tokens = Array.from({ length: 150 }, (_, i) => `ExponentPushToken[token-${i}]`);
  const fetchImpl = fakeFetch(() => Array.from({ length: 100 }, () => ({ status: 'ok' })));
  await sendPushNotifications(tokens, { title: 't', body: 'b' }, { fetchImpl });
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(fetchImpl.calls[0].body.length, 100);
  assert.equal(fetchImpl.calls[1].body.length, 50);
});
