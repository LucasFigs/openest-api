#!/usr/bin/env node
// Verificação ponta a ponta Web ↔ Mobile contra a API rodando + PostgreSQL.
//
//   npm run verify:integration            (com a API já rodando: npm run dev)
//
// O que verifica, pelo MESMO endereço de rede que o celular usa:
//   1. Banco: conexão e contas de teste existentes.
//   2. Login das duas contas (mesmo payload do web e do mobile).
//   3. Descoberta: GET /api/users/buscar devolve perfis e as fotos abrem.
//   4. Chat: as duas contas têm uma conversa (cria o match pelas rotas
//      oficiais /api/curtir se ainda não existir);
//      A envia pelo SOCKET (caminho do mobile) → B recebe ao vivo;
//      B envia pelo REST /api/mensagens (caminho do web) → A recebe ao vivo;
//      as duas mensagens estão no histórico e no PostgreSQL.
//   5. Limpeza: apaga do banco só as 2 mensagens de verificação.
//      (o match/conversa criados ficam, para o teste manual).
//
// Variáveis opcionais: VERIFY_API_URL, VERIFY_EMAIL_A, VERIFY_PASSWORD_A,
// VERIFY_EMAIL_B, VERIFY_PASSWORD_B.  Flags: --keep-messages, --no-setup.
const os = require('os');
const path = require('path');

process.chdir(path.join(__dirname, '..')); // dotenv/config leem o .env daqui
const db = require('../src/models');
const { io: connectClient } = require('socket.io-client');

const args = new Set(process.argv.slice(2));
const PORT = Number(process.env.PORT) || 3000;
const lanIp = Object.values(os.networkInterfaces())
  .flat()
  .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
const API_URL = (process.env.VERIFY_API_URL || `http://${lanIp || 'localhost'}:${PORT}`).replace(/\/+$/, '');

const ACCOUNT_A = { email: process.env.VERIFY_EMAIL_A || 'perigoboy@openest.com', password: process.env.VERIFY_PASSWORD_A || '123456' };
const ACCOUNT_B = { email: process.env.VERIFY_EMAIL_B || 'regislindao@openest.com', password: process.env.VERIFY_PASSWORD_B || '123456' };

const results = [];
function check(ok, label, detail = '') {
  results.push({ ok, label });
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) throw new Error(label);
}
const info = (msg) => console.log(`   ${msg}`);

async function http(method, route, { token, body } = {}) {
  const res = await fetch(`${API_URL}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo JSON */ }
  return { status: res.status, data };
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = connectClient(API_URL, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true, timeout: 8000 });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => { socket.close(); reject(err); });
  });
}

function waitForMessage(socket, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('new_message', handler); reject(new Error('timeout esperando new_message')); }, timeoutMs);
    function handler(msg) {
      if (!predicate(msg)) return;
      clearTimeout(timer);
      socket.off('new_message', handler);
      resolve(msg);
    }
    socket.on('new_message', handler);
  });
}

async function findConversationWith(token, otherUserId) {
  const { status, data } = await http('GET', '/api/conversas', { token });
  if (status !== 200 || !Array.isArray(data)) return null;
  return data.find((c) => String(c.other_user_id) === String(otherUserId)) || null;
}

async function main() {
  console.log(`\n🔎 Verificando integração em ${API_URL}\n`);
  const sockets = [];
  const createdMessageIds = [];

  try {
    // 1. Banco ----------------------------------------------------------------
    await db.sequelize.authenticate({ logging: false });
    const [users, messages] = await Promise.all([
      db.User.count({ logging: false }),
      db.Message.count({ logging: false }),
    ]);
    check(true, 'PostgreSQL conectado', `${users} usuários ativos, ${messages} mensagens`);
    for (const acc of [ACCOUNT_A, ACCOUNT_B]) {
      const exists = await db.User.findOne({ where: { email: acc.email }, logging: false });
      check(!!exists, `Conta de teste existe no banco: ${acc.email}`);
    }

    // 2. API no ar pela rede + login -------------------------------------------
    let health;
    try {
      health = await http('GET', '/health');
    } catch (err) {
      check(false, `API acessível em ${API_URL}`, `${err.cause?.code || err.message}. Ela está rodando? (npm run dev)`);
    }
    check(health.status === 200, `API acessível pela rede local (${API_URL}/health)`, `HTTP ${health.status}`);

    const sessions = [];
    for (const acc of [ACCOUNT_A, ACCOUNT_B]) {
      const { status, data } = await http('POST', '/api/users/login', { body: acc });
      check(status === 200 && !!data?.token && !!data?.user?.id, `Login ${acc.email}`, `HTTP ${status}${data?.message ? ` (${data.message})` : ''}`);
      sessions.push({ ...acc, token: data.token, user: data.user });
    }
    const [A, B] = sessions;

    // 3. Descoberta -------------------------------------------------------------
    const discovery = await http('GET', '/api/users/buscar?page=1&limit=10&idade_min=18&idade_max=35', { token: A.token });
    const perfis = discovery.data?.perfis;
    check(discovery.status === 200 && Array.isArray(perfis), 'Descoberta (GET /api/users/buscar)', `${perfis?.length ?? 0} perfis na 1ª página, ${discovery.data?.total_resultados ?? '?'} no total`);
    const photoUrls = perfis.flatMap((p) => [...(Array.isArray(p.photos) ? p.photos : []), p.foto_url]).filter((u) => typeof u === 'string' && u);
    const localUrls = photoUrls.filter((u) => /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/)/i.test(u));
    check(localUrls.length === 0, 'Fotos sem "localhost" (carregam no Android)', `${photoUrls.length} URLs de foto`);
    if (photoUrls.length) {
      const res = await fetch(photoUrls[0], { method: 'HEAD', signal: AbortSignal.timeout(10000) });
      check(res.ok && /^image\//.test(res.headers.get('content-type') || ''), 'Foto de perfil abre', `${res.status} ${res.headers.get('content-type')}`);
    } else {
      info('⚠️  Nenhum perfil com foto na 1ª página (os cards usam avatar gerado).');
    }

    // 4. Chat -------------------------------------------------------------------
    let conversation = await findConversationWith(A.token, B.user.id);
    if (!conversation && !args.has('--no-setup')) {
      info(`Sem conversa entre ${A.email} e ${B.email}: criando o match pelas rotas oficiais (/api/curtir)...`);
      const likeA = await http('POST', `/api/curtir/${B.user.id}`, { token: A.token });
      info(`curtida A→B: HTTP ${likeA.status} — ${likeA.data?.message || ''} (match=${likeA.data?.match})`);
      conversation = await findConversationWith(A.token, B.user.id);
      if (!conversation) {
        // Só precisa da curtida de volta se a de A não fechou o match.
        const likeB = await http('POST', `/api/curtir/${A.user.id}`, { token: B.token });
        info(`curtida B→A: HTTP ${likeB.status} — ${likeB.data?.message || ''} (match=${likeB.data?.match})`);
        conversation = await findConversationWith(A.token, B.user.id);
      }
    }
    check(!!conversation, 'Conversa entre as duas contas (GET /api/conversas)', conversation ? `conversa #${conversation.id}` : 'não encontrada (as duas já se curtiram sem gerar match?)');
    const conversationFromB = await findConversationWith(B.token, A.user.id);
    check(conversationFromB?.id === conversation.id, 'A mesma conversa aparece para as duas contas');

    const [socketA, socketB] = await Promise.all([connectSocket(A.token), connectSocket(B.token)]);
    sockets.push(socketA, socketB);
    check(true, 'Socket.IO conectado com JWT nas duas contas');

    const [joinA, joinB] = await Promise.all([
      socketA.timeout(5000).emitWithAck('join_conversation', conversation.id),
      socketB.timeout(5000).emitWithAck('join_conversation', conversation.id),
    ]);
    check(joinA?.ok && joinB?.ok, 'Entraram na sala da conversa (join_conversation)');

    const stamp = new Date().toISOString();
    const textFromA = `[verificação automática ${stamp}] mobile → web`;
    const receivedByB = waitForMessage(socketB, (m) => m.content === textFromA);
    const ack = await socketA.timeout(5000).emitWithAck('send_message', { conversation_id: conversation.id, content: textFromA });
    check(ack?.ok && !!ack.message?.id, 'Envio pelo socket (caminho do mobile) confirmado', `mensagem #${ack?.message?.id}`);
    createdMessageIds.push(ack.message.id);
    const gotB = await receivedByB;
    check(String(gotB.sender_id) === String(A.user.id), 'Destinatário recebeu ao vivo (new_message)');

    const textFromB = `[verificação automática ${stamp}] web → mobile`;
    const receivedByA = waitForMessage(socketA, (m) => m.content === textFromB);
    const rest = await http('POST', '/api/mensagens', { token: B.token, body: { conversation_id: conversation.id, content: textFromB } });
    check(rest.status === 201 && !!rest.data?.id, 'Envio pelo REST /api/mensagens (caminho do web)', `mensagem #${rest.data?.id}`);
    createdMessageIds.push(rest.data.id);
    await receivedByA;
    check(true, 'O outro lado recebeu ao vivo (new_message)');

    const history = await http('GET', `/api/${conversation.id}/mensagens?page=1&limit=20`, { token: A.token });
    const historyIds = (history.data?.messages || []).map((m) => m.id);
    check(createdMessageIds.every((id) => historyIds.includes(id)), 'Histórico (GET /api/:id/mensagens) traz as duas mensagens');

    const inDb = await db.Message.count({ where: { id: createdMessageIds }, logging: false });
    check(inDb === 2, 'Mensagens gravadas no PostgreSQL', `${inDb}/2`);
  } finally {
    sockets.forEach((s) => s.close());
    if (createdMessageIds.length && !args.has('--keep-messages')) {
      await db.Message.destroy({ where: { id: createdMessageIds }, logging: false });
      info(`🧹 Mensagens de verificação removidas do banco (${createdMessageIds.join(', ')}).`);
    }
    await db.sequelize.close();
  }
}

main()
  .then(() => {
    console.log(`\n🎉 Tudo certo: ${results.length} verificações passaram.\n`);
    console.log(`   Login web/Android: ${ACCOUNT_A.email} e ${ACCOUNT_B.email}`);
    process.exit(0);
  })
  .catch((err) => {
    if (!results.some((r) => !r.ok)) console.error(`❌ Erro inesperado: ${err.message}`);
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} verificações passaram.\n`);
    process.exit(1);
  });
