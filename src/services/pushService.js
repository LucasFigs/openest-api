// T048 — Envio de Push Notifications pelo serviço da Expo.
// O app mobile registra o Expo Push Token do aparelho (POST /api/users/push-token)
// e o backend dispara a notificação remota quando chega uma mensagem ou um
// match — é isso que faz o aviso chegar com o app em segundo plano/fechado.
//
// Doc: https://docs.expo.dev/push-notifications/sending-notifications/

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// A API da Expo aceita no máximo 100 mensagens por requisição.
const EXPO_PUSH_CHUNK_SIZE = 100;

function isExpoPushToken(token) {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

// Monta uma mensagem por token válido (sem duplicados). Tokens inválidos são
// descartados silenciosamente para não derrubar o envio dos demais.
function buildPushMessages(tokens, { title, body, data } = {}) {
  const unique = [...new Set((tokens || []).filter(isExpoPushToken))];
  return unique.map((to) => ({
    to,
    title,
    body,
    data: data || {},
    sound: 'default',
    priority: 'high',
    // Mesmo canal criado no app (src/services/notifications.js).
    channelId: 'default',
  }));
}

function chunk(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

// Envia as notificações e devolve os tokens que a Expo marcou como inválidos
// (DeviceNotRegistered) para o chamador poder limpá-los do banco.
// Nunca lança: falha de push não pode quebrar o envio de mensagem/match.
async function sendPushNotifications(tokens, payload, { fetchImpl = globalThis.fetch } = {}) {
  const messages = buildPushMessages(tokens, payload);
  const result = { sent: 0, invalidTokens: [] };
  if (!messages.length || typeof fetchImpl !== 'function') return result;

  for (const batch of chunk(messages, EXPO_PUSH_CHUNK_SIZE)) {
    try {
      const response = await fetchImpl(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        console.error('❌ Expo Push respondeu com status', response.status);
        continue;
      }

      const json = await response.json();
      const tickets = Array.isArray(json?.data) ? json.data : [];
      tickets.forEach((ticket, index) => {
        if (ticket?.status === 'ok') {
          result.sent += 1;
        } else if (ticket?.details?.error === 'DeviceNotRegistered') {
          result.invalidTokens.push(batch[index].to);
        } else if (ticket) {
          console.error('❌ Expo Push recusou a notificação:', ticket.message || ticket);
        }
      });
    } catch (error) {
      console.error('❌ Erro ao enviar push notification:', error.message || error);
    }
  }

  return result;
}

module.exports = {
  EXPO_PUSH_URL,
  isExpoPushToken,
  buildPushMessages,
  sendPushNotifications,
};
