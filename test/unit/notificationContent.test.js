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

const {
  buildRealtimeMessagePayload,
  buildRealtimeMatchPayload,
  safeAvatar,
} = require('../../src/services/notificationContent');

test('safeAvatar só aceita URLs http(s)', () => {
  assert.equal(safeAvatar('https://res.cloudinary.com/x/a.jpg'), 'https://res.cloudinary.com/x/a.jpg');
  assert.equal(safeAvatar('http://localhost:3000/u/a.png'), 'http://localhost:3000/u/a.png');
  assert.equal(safeAvatar('file:///x.jpg'), null);
  assert.equal(safeAvatar(''), null);
  assert.equal(safeAvatar(null), null);
});

test('payload de mensagem (banner) leva nome, foto e prévia', () => {
  const p = buildRealtimeMessagePayload({
    conversationId: 8, senderId: 'u1', senderName: 'Ana',
    senderAvatar: 'https://res.cloudinary.com/x/ana.jpg', content: 'Oi, tudo bem?',
  });
  assert.equal(p.type, 'message');
  assert.equal(p.conversation_id, 8);
  assert.equal(p.sender_id, 'u1');
  assert.equal(p.sender_name, 'Ana');
  assert.equal(p.sender_avatar, 'https://res.cloudinary.com/x/ana.jpg');
  assert.equal(p.content, 'Oi, tudo bem?');
  assert.equal(p.title, 'Ana'); // compat. nativa
});

test('payload de mensagem respeita Modo Discreto do destinatário', () => {
  const p = buildRealtimeMessagePayload({
    conversationId: 8, senderId: 'u1', senderName: 'Ana',
    senderAvatar: 'https://res.cloudinary.com/x/ana.jpg', content: 'segredo', recipientDiscreet: true,
  });
  assert.equal(p.sender_name, null);
  assert.equal(p.sender_avatar, null);
  assert.equal(p.content, null);
  assert.ok(!JSON.stringify(p).includes('Ana'));
  assert.ok(!JSON.stringify(p).includes('segredo'));
  assert.ok(!JSON.stringify(p).includes('cloudinary'));
});

test('payload de mensagem marca imagem como prévia e descarta avatar inválido', () => {
  const img = buildRealtimeMessagePayload({ conversationId: 1, senderId: 'u1', senderName: 'Ana', content: 'x', isImage: true, senderAvatar: 'nao-e-url' });
  assert.equal(img.content, '📷 Nova imagem');
  assert.equal(img.sender_avatar, null);
  const imgUrl = buildRealtimeMessagePayload({ conversationId: 1, senderId: 'u1', senderName: 'Ana', content: 'https://cdn.x/a.jpg' });
  assert.equal(imgUrl.content, '📷 Nova imagem');
});

test('payload de match leva o OUTRO usuário (nome + foto), com Modo Discreto', () => {
  const p = buildRealtimeMatchPayload({
    matchId: 'm1', conversationId: 9, otherUserId: 'u2',
    otherUserName: 'Bruno', otherUserAvatar: 'https://res.cloudinary.com/x/bruno.jpg',
  });
  assert.equal(p.type, 'match');
  assert.equal(p.user_id, 'u2');
  assert.equal(p.other_user_name, 'Bruno');
  assert.equal(p.other_user_avatar, 'https://res.cloudinary.com/x/bruno.jpg');

  const d = buildRealtimeMatchPayload({ matchId: 'm1', conversationId: 9, otherUserId: 'u2', otherUserName: 'Bruno', otherUserAvatar: 'https://x/b.jpg', otherDiscreet: true });
  assert.equal(d.other_user_name, null);
  assert.equal(d.other_user_avatar, null);
});
