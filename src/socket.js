// T045 — Chat em tempo real (Socket.IO).
// Extraído do server.js para poder ser testado sem banco/rede: as
// dependências (db, verificação de JWT, notificações) são injetáveis.
//
// Protocolo usado pelo web e pelo mobile:
//   cliente → servidor
//     join_conversation (conversationId, ack?)   entra na sala `chat_<id>`
//     leave_conversation (conversationId)
//     send_message ({ conversation_id, content }, ack?)
//     typing_start / typing_stop ({ conversation_id })   só para quem está na sala
//     mark_delivered ({ conversation_id })   destinatário recebeu  → 2 checks cinzas
//     mark_read ({ conversation_id })        destinatário abriu    → 2 checks azuis*
//        (*) só se NENHUM dos dois estiver em Modo Discreto
//   servidor → cliente
//     message_status_updated ({ conversation_id, status, message_ids, read_receipts_blocked })
//     new_message (mensagem salva)        para a sala `chat_<id>`
//     user_typing ({ user_id, is_typing })
//     notification ({ type, title, body, conversation_id, sender_id })  sala `user_<id>`
//     new_match ({ match_id, conversation_id, user_id })                sala `user_<id>`
const jwt = require('jsonwebtoken');
const messageStatus = require('./services/messageStatus');

function defaultVerifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => (err ? reject(err) : resolve(decoded)));
  });
}

// Garante que o callback de confirmação (ack) é opcional para o cliente.
const toAck = (ack) => (typeof ack === 'function' ? ack : () => {});

function setupSocket(io, deps = {}) {
  const db = deps.db || require('./models');
  const notifications = deps.notifications || require('./services/notificationService');
  const verifyToken = deps.verifyToken || defaultVerifyToken;
  const logger = deps.logger || console;
  const status = deps.messageStatus || messageStatus;

  // Um usuário está "conectado" se tem algum socket na sala pessoal.
  const isUserOnline = (userId) => {
    try {
      const room = io.sockets && io.sockets.adapter && io.sockets.adapter.rooms
        ? io.sockets.adapter.rooms.get(`user_${userId}`)
        : null;
      return !!(room && room.size > 0);
    } catch (_) {
      return false;
    }
  };

  // O usuário está com ESTA conversa aberta se algum socket dele está na sala
  // `chat_<id>`. Deixa o SERVIDOR decidir entre entregue e lido, em vez de
  // depender do cliente lembrar de emitir `mark_read`.
  const isUserInConversation = (userId, conversationId) => {
    try {
      const sockets = io.sockets && io.sockets.sockets;
      if (!sockets || typeof sockets.values !== 'function') return false;
      for (const s of sockets.values()) {
        if (s && s.user && String(s.user.id) === String(userId)
            && s.rooms && typeof s.rooms.has === 'function'
            && s.rooms.has(`chat_${conversationId}`)) {
          return true;
        }
      }
      return false;
    } catch (_) {
      return false;
    }
  };

  // Autenticação: o cliente manda o JWT em `auth.token` e o servidor VALIDA a
  // assinatura antes de aceitar a conexão. O id do usuário passa a vir do
  // token — nunca do payload enviado pelo cliente.
  io.use(async (socket, next) => {
    const token = socket.handshake && socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('Erro de autenticação'));
    try {
      const decoded = await verifyToken(token);
      if (!decoded || !decoded.id) return next(new Error('Erro de autenticação'));
      socket.user = { id: decoded.id };
      return next();
    } catch (error) {
      return next(new Error('Erro de autenticação'));
    }
  });

  io.on('connection', (socket) => {
    logger.log('📡 Novo cliente conectado ao WebSocket:', socket.id);

    // Sala pessoal: recebe `notification` (nova mensagem) e `new_match` (T048)
    // mesmo sem estar com a conversa aberta.
    socket.join(`user_${socket.user.id}`);

    // 1. Entrar na sala da conversa — só quem participa do match.
    socket.on('join_conversation', async (conversationId, ack) => {
      const reply = toAck(ack);
      try {
        const access = await notifications.getConversationAccess(conversationId, socket.user.id);
        if (!access) return reply({ ok: false, error: 'Conversa não encontrada' });
        socket.join(`chat_${conversationId}`);
        logger.log(`💬 Usuário entrou no chat: ${conversationId}`);
        // Entrou na conversa ⇒ o que ele recebeu foi lido (o serviço aplica a
        // trava do Modo Discreto e para em `delivered` quando for o caso).
        status.markRead({
          db, io, conversationId, readerId: socket.user.id, otherUserId: access.otherUserId,
        }).catch((error) => logger.error('❌ Erro ao marcar lidas:', error));
        return reply({ ok: true });
      } catch (error) {
        logger.error('❌ Erro ao entrar na conversa:', error);
        return reply({ ok: false, error: 'Erro ao entrar na conversa' });
      }
    });

    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`chat_${conversationId}`);
    });

    // 2. Enviar mensagem (Task #27 / T045). Responde via ack com a mensagem
    // salva para o app trocar a bolha "enviando" pela definitiva.
    socket.on('send_message', async (data, ack) => {
      const reply = toAck(ack);
      const conversationId = data && data.conversation_id;
      const content = data && typeof data.content === 'string' ? data.content.trim() : '';
      if (!conversationId || !content) {
        return reply({ ok: false, error: 'Mensagem inválida' });
      }

      try {
        const access = await notifications.getConversationAccess(conversationId, socket.user.id);
        if (!access) return reply({ ok: false, error: 'Conversa não encontrada' });

        const newMessage = await db.Message.create({
          conversation_id: conversationId,
          sender_id: socket.user.id,
          content,
          status: status.MESSAGE_STATUS.SENT, // 1 check cinza
        });

        io.to(`chat_${conversationId}`).emit('new_message', newMessage);
        reply({ ok: true, message: newMessage });

        // Destinatário com a conversa ABERTA ⇒ já foi LIDA (2 checks azuis,
        // salvo Modo Discreto). Só conectado ⇒ ENTREGUE (2 checks cinzas).
        if (isUserInConversation(access.otherUserId, conversationId)) {
          status.markRead({
            db, io, conversationId,
            readerId: access.otherUserId, otherUserId: socket.user.id,
          }).catch((error) => logger.error('❌ Erro ao marcar lida:', error));
        } else if (isUserOnline(access.otherUserId)) {
          status.markDelivered({ db, io, conversationId, recipientId: access.otherUserId })
            .catch((error) => logger.error('❌ Erro ao marcar entregue:', error));
        }

        // Garantia extra: quem está respondendo obviamente LEU o que recebeu
        // nessa conversa. Marca tudo que chegou para ele como lido (respeitando
        // o Modo Discreto), para os checks do outro lado não travarem em 1.
        status.markRead({
          db, io, conversationId, readerId: socket.user.id, otherUserId: access.otherUserId,
        }).catch((error) => logger.error('❌ Erro ao marcar lidas ao responder:', error));

        // Avisa o destinatário (socket + push). Fica fora do try acima: a
        // mensagem já foi salva/confirmada, então uma falha aqui só é logada.
        notifyRecipient(socket.user.id, conversationId, access.otherUserId, content);
      } catch (error) {
        logger.error('❌ Erro ao processar mensagem via Socket:', error);
        reply({ ok: false, error: 'Erro ao enviar mensagem' });
      }
    });

    async function notifyRecipient(senderId, conversationId, recipientId, content) {
      try {
        const sender = await db.User.findByPk(senderId, { attributes: ['name', 'foto_url'] });
        await notifications.notifyNewMessage({
          io,
          conversationId,
          senderId,
          senderName: sender ? sender.name : null,
          senderAvatar: sender ? sender.foto_url : null,
          recipientId,
          content,
        });
      } catch (error) {
        logger.error('❌ Erro ao notificar destinatário:', error);
      }
    }

    // 3. Confirmação de ENTREGA e LEITURA (estilo WhatsApp).
    // O `read` respeita a regra recíproca do Modo Discreto: se o remetente OU
    // o destinatário estiver discreto, o status para em `delivered`.
    socket.on('mark_delivered', async (data, ack) => {
      const reply = toAck(ack);
      const conversationId = data && data.conversation_id;
      if (!conversationId) return reply({ ok: false, error: 'Conversa inválida' });
      try {
        const access = await notifications.getConversationAccess(conversationId, socket.user.id);
        if (!access) return reply({ ok: false, error: 'Conversa não encontrada' });
        const result = await status.markDelivered({
          db, io, conversationId, recipientId: socket.user.id,
        });
        return reply({ ok: true, updated: result.updatedIds.length });
      } catch (error) {
        logger.error('❌ Erro ao marcar entregue:', error);
        return reply({ ok: false, error: 'Erro ao marcar entregue' });
      }
    });

    socket.on('mark_read', async (data, ack) => {
      const reply = toAck(ack);
      const conversationId = data && data.conversation_id;
      if (!conversationId) return reply({ ok: false, error: 'Conversa inválida' });
      try {
        const access = await notifications.getConversationAccess(conversationId, socket.user.id);
        if (!access) return reply({ ok: false, error: 'Conversa não encontrada' });
        const result = await status.markRead({
          db, io, conversationId, readerId: socket.user.id, otherUserId: access.otherUserId,
        });
        return reply({ ok: true, updated: result.updatedIds.length, read_receipts_blocked: !result.allowRead });
      } catch (error) {
        logger.error('❌ Erro ao marcar lido:', error);
        return reply({ ok: false, error: 'Erro ao marcar lido' });
      }
    });

    // 4. Indicador de digitação (Task #64 / T046). O `user_id` repassado vem
    // do JWT (não do payload), e só quem está na sala da conversa avisa.
    const relayTyping = (isTyping) => (data) => {
      const conversationId = data && data.conversation_id;
      if (!conversationId || !socket.rooms.has(`chat_${conversationId}`)) return;
      socket.to(`chat_${conversationId}`).emit('user_typing', { user_id: socket.user.id, is_typing: isTyping });
    };
    socket.on('typing_start', relayTyping(true));
    socket.on('typing_stop', relayTyping(false));

    // 5. Desconexão
    socket.on('disconnect', () => {
      logger.log('🔌 Cliente desconectado');
    });
  });

  return io;
}

module.exports = { setupSocket };
