// Nomes das salas do Socket.io, num lugar só.
//
// `user:<id>` é a sala PESSOAL e persistente do usuário: o socket entra nela
// ao autenticar e em toda reconexão. É por ela que chegam avisos que não
// dependem de ter uma conversa aberta (notificações, novo match e,
// principalmente, a atualização dos checks das mensagens que ELE enviou).
const userRoom = (userId) => `user:${userId}`;

// `chat_<id>` é a sala de uma conversa específica (quem está com ela aberta).
const chatRoom = (conversationId) => `chat_${conversationId}`;

module.exports = { userRoom, chatRoom };
