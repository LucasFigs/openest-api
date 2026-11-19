// T048 — conteúdo das notificações (Modo Discreto, imagens, deep link).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DISCREET_MESSAGE,
  DISCREET_MATCH,
  buildMessageNotification,
  buildMatchNotification,
  buildNotificationData,
  getOtherParticipantId,
} = require('../../src/services/notificationContent');

test('mensagem comum mostra o nome de quem enviou e o texto', () => {
  const n = buildMessageNotification({ senderName: 'Ana', recipientDiscreet: false, content: 'Oi, tudo bem?' });
  assert.deepEqual(n, { title: 'Ana', body: 'Oi, tudo bem?' });
});

test('Modo Discreto do destinatário esconde nome e texto', () => {
  const n = buildMessageNotification({ senderName: 'Ana', recipientDiscreet: true, content: 'segredo' });
  assert.deepEqual(n, DISCREET_MESSAGE);
  assert.ok(!JSON.stringify(n).includes('Ana'));
  assert.ok(!JSON.stringify(n).includes('segredo'));
});

test('imagem (flag ou URL de imagem) vira "Nova imagem recebida"', () => {
  assert.equal(
    buildMessageNotification({ senderName: 'Ana', content: 'https://res.cloudinary.com/x/foto.jpg' }).body,
    '📷 Nova imagem recebida'
  );
  assert.equal(buildMessageNotification({ senderName: 'Ana', content: 'qualquer', isImage: true }).body, '📷 Nova imagem recebida');
});

test('texto longo é truncado para caber na notificação', () => {
  const n = buildMessageNotification({ senderName: 'Ana', content: 'a'.repeat(500) });
  assert.ok(n.body.length <= 140);
  assert.ok(n.body.endsWith('…'));
});

test('match mostra o nome do outro usuário, exceto no Modo Discreto', () => {
  assert.match(buildMatchNotification({ otherUserName: 'Bruno' }).body, /Bruno/);
  assert.deepEqual(buildMatchNotification({ otherUserName: 'Bruno', recipientDiscreet: true }), DISCREET_MATCH);
});

test('payload de dados leva só tipo e id da conversa (como string)', () => {
  assert.deepEqual(buildNotificationData({ type: 'message', conversationId: 42 }), { type: 'message', conversationId: '42' });
  assert.deepEqual(buildNotificationData({ type: 'match' }), { type: 'match' });
});

test('getOtherParticipantId só reconhece participantes do match', () => {
  const match = { user1_id: 'u1', user2_id: 'u2' };
  assert.equal(getOtherParticipantId(match, 'u1'), 'u2');
  assert.equal(getOtherParticipantId(match, 'u2'), 'u1');
  assert.equal(getOtherParticipantId(match, 'intruso'), null);
  assert.equal(getOtherParticipantId(null, 'u1'), null);
});
