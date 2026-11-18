// Confirmação de envio / entrega / leitura (estilo WhatsApp) + Modo Discreto.
//
//   sent      → 1 check cinza        (salva no banco)
//   delivered → 2 checks cinzas      (destinatário recebeu)
//   read      → 2 checks AZUIS       (destinatário abriu a conversa)
//
// REGRA RECÍPROCA DO MODO DISCRETO: se QUALQUER UM dos dois participantes
// (remetente OU destinatário) estiver com o Modo Discreto ligado, o estado
// `read` nunca acontece para NENHUM dos dois — o teto passa a ser `delivered`.
// Isso vale nos dois sentidos: quem liga o Modo Discreto também deixa de ver
// os checks azuis das mensagens que ele enviou.

const MESSAGE_STATUS = {
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
};

// Ordem de progressão: o status nunca "anda para trás".
const RANK = { sent: 0, delivered: 1, read: 2 };

function rankOf(status) {
  return RANK[status] != null ? RANK[status] : 0;
}

// Checks azuis só quando NENHUM dos dois está em Modo Discreto.
function canShowReadReceipts(senderDiscreet, recipientDiscreet) {
  return senderDiscreet !== true && recipientDiscreet !== true;
}

// Decide o status final de uma mensagem.
// - nunca regride (um `read` não volta a `delivered`);
// - `read` vira `delivered` quando os recibos estão bloqueados pelo Modo Discreto.
function resolveStatus(currentStatus, targetStatus, { allowRead = true } = {}) {
  let target = targetStatus;
  if (target === MESSAGE_STATUS.READ && !allowRead) {
    target = MESSAGE_STATUS.DELIVERED;
  }
  return rankOf(target) > rankOf(currentStatus) ? target : currentStatus;
}

// Monta o patch (campos a gravar) para um novo status, preenchendo os
// carimbos de tempo só na primeira vez que cada etapa acontece.
function buildStatusPatch(message, targetStatus, { allowRead = true, now = new Date() } = {}) {
  const current = message && message.status ? message.status : MESSAGE_STATUS.SENT;
  const next = resolveStatus(current, targetStatus, { allowRead });
  if (next === current) return null; // nada mudou → não grava nem emite

  const patch = { status: next };
  if (rankOf(next) >= rankOf(MESSAGE_STATUS.DELIVERED) && !(message && message.delivered_at)) {
    patch.delivered_at = now;
  }
  if (next === MESSAGE_STATUS.READ && !(message && message.read_at)) {
    patch.read_at = now;
  }
  return patch;
}

// Lê o Modo Discreto dos dois participantes e diz se os checks azuis valem.
async function readReceiptsAllowed(db, userAId, userBId) {
  const ids = [userAId, userBId].filter(Boolean);
  if (ids.length < 2) return false;
  const users = await db.User.findAll({
    where: { id: ids },
    attributes: ['id', 'modo_discreto'],
  });
  // Se algum dos dois não for encontrado, não arriscamos mostrar recibo.
  if (!users || users.length < 2) return false;
  return users.every((u) => u.modo_discreto !== true);
}

// Evento único de tempo real para os dois lados do chat.
// payload: { conversation_id, status, message_ids, read_receipts_blocked }
const STATUS_EVENT = 'message_status_updated';

function emitStatus(io, conversationId, payload) {
  if (!io || !conversationId) return;
  io.to(`chat_${conversationId}`).emit(STATUS_EVENT, {
    conversation_id: conversationId,
    ...payload,
  });
}

// Aplica um status a todas as mensagens da conversa que NÃO foram enviadas
// por `viewerId` (ou seja, as que ele recebeu) e que ainda não chegaram lá.
// Devolve { updatedIds, status } — vazio quando não havia nada a mudar.
async function applyStatusToConversation({
  db, conversationId, viewerId, targetStatus, allowRead = true, now = new Date(),
}) {
  const { Op } = db.Sequelize || require('sequelize');
  const messages = await db.Message.findAll({
    where: {
      conversation_id: conversationId,
      sender_id: { [Op.ne]: viewerId },
    },
  });

  const updatedIds = [];
  let finalStatus = null;

  for (const message of messages) {
    const patch = buildStatusPatch(message, targetStatus, { allowRead, now });
    if (!patch) continue;
    await message.update(patch);
    updatedIds.push(message.id);
    finalStatus = patch.status;
  }

  return { updatedIds, status: finalStatus };
}

// ENTREGUE: o destinatário recebeu (está online / abriu o app).
async function markDelivered({ db, io, conversationId, recipientId }) {
  const result = await applyStatusToConversation({
    db, conversationId, viewerId: recipientId, targetStatus: MESSAGE_STATUS.DELIVERED,
  });
  if (result.updatedIds.length) {
    emitStatus(io, conversationId, {
      status: MESSAGE_STATUS.DELIVERED,
      message_ids: result.updatedIds,
    });
  }
  return result;
}

// LIDO: o destinatário abriu a conversa. Respeita a regra recíproca do
// Modo Discreto — se qualquer um dos dois estiver discreto, para em `delivered`.
async function markRead({ db, io, conversationId, readerId, otherUserId }) {
  const allowRead = await readReceiptsAllowed(db, readerId, otherUserId);
  const target = allowRead ? MESSAGE_STATUS.READ : MESSAGE_STATUS.DELIVERED;

  const result = await applyStatusToConversation({
    db, conversationId, viewerId: readerId, targetStatus: target, allowRead,
  });

  if (result.updatedIds.length) {
    emitStatus(io, conversationId, {
      status: result.status,
      message_ids: result.updatedIds,
      read_receipts_blocked: !allowRead,
    });
  }
  return { ...result, allowRead };
}

module.exports = {
  STATUS_EVENT,
  emitStatus,
  applyStatusToConversation,
  markDelivered,
  markRead,
  MESSAGE_STATUS,
  rankOf,
  canShowReadReceipts,
  resolveStatus,
  buildStatusPatch,
  readReceiptsAllowed,
};
