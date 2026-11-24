// Resposta com citação (estilo WhatsApp).
//
// A mensagem citada só vale se existir e for DA MESMA conversa: um id de
// outra conversa é ignorado (a resposta sai sem citação), para ninguém
// conseguir "citar" e assim ler mensagens de conversas alheias.

async function findReplyTarget({ Message, User, conversationId, replyToId }) {
  if (replyToId === undefined || replyToId === null || replyToId === '') return null;
  const id = Number(replyToId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const options = { where: { id, conversation_id: conversationId } };
  if (User && Message.associations && Message.associations.sender) {
    options.include = [{ model: User, as: 'sender', attributes: ['id', 'name'] }];
  }
  const target = await Message.findOne(options);
  return target || null;
}

// Include do histórico: cada mensagem já vem com a citada + nome do autor.
function replyInclude(Message, User) {
  if (!Message.associations || !Message.associations.replyTo) return [];
  const inner = User && Message.associations.sender
    ? [{ model: User, as: 'sender', attributes: ['id', 'name'] }]
    : [];
  return [{ model: Message, as: 'replyTo', required: false, include: inner }];
}

module.exports = { findReplyTarget, replyInclude };
