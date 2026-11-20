const { Conversation, Message, User, Match } = require('../models');
const { Op } = require('sequelize');
const { classifyMessage, previewText } = require('../services/messageSerializer');

// Resumo da última mensagem para a lista estilo WhatsApp: tipo (o cliente
// desenha o ícone), texto curto, quem mandou e o status (ticks na lista).
// Nunca expõe a URL de uma foto de visualização única.
function resumoUltimaMensagem(message, userId) {
  if (!message) return null;
  return {
    id: message.id,
    type: classifyMessage(message),
    preview: previewText(message),
    sender_id: message.sender_id,
    is_mine: String(message.sender_id) === String(userId),
    status: message.status || 'sent',
    is_view_once: !!message.is_view_once,
    is_opened: !!message.is_opened,
    created_at: message.created_at || message.createdAt || null,
  };
}

exports.listConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    const matches = await Match.findAll({
      where: { [Op.or]: [{ user1_id: userId }, { user2_id: userId }] }
    });

    if (!matches.length) return res.status(200).json([]);

    const matchIds = matches.map(m => m.id);

    const conversations = await Conversation.findAll({
      where: { match_id: { [Op.in]: matchIds } },
    });

    const formatted = await Promise.all(conversations.map(async (conv) => {
      const match       = matches.find(m => m.id === conv.match_id);
      const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;

      const [otherUser, ultima, unreadCount] = await Promise.all([
        User.findByPk(otherUserId, { attributes: ['id', 'name', 'foto_url'] }),
        Message.findOne({ where: { conversation_id: conv.id }, order: [['id', 'DESC']] }),
        // Não lidas = chegaram do OUTRO e eu ainda não vi (seen_at). Vale
        // mesmo com Modo Discreto, que só esconde o recibo azul do remetente.
        Message.count({
          where: { conversation_id: conv.id, sender_id: { [Op.ne]: userId }, seen_at: null },
        }),
      ]);

      const lastMessage = resumoUltimaMensagem(ultima, userId);
      const atividade = lastMessage?.created_at || conv.created_at || conv.createdAt || match.created_at || null;

      return {
        id:            conv.id,
        other_user_id: otherUserId,   // ← campo necessário para o agendamento
        name:          otherUser?.name || 'Usuário',
        // `avatar` é a foto real (ou null → o cliente desenha as iniciais).
        avatar:        otherUser?.foto_url || null,
        img:           otherUser?.foto_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherUser?.name || 'U')}`,
        timestamp:     atividade,
        lastMessage:   lastMessage ? lastMessage.preview : null,
        last_message:  lastMessage,
        unreadCount,
      };
    }));

    // Mais recente primeiro (como o WhatsApp).
    formatted.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    // 🔒 Deduplicação: cada contato aparece UMA vez na lista de conversas,
    // mesmo que existam matches/conversas duplicados para o mesmo par. Como a
    // lista já está ordenada, fica a conversa com atividade mais recente.
    const porContato = new Map();
    for (const conv of formatted) {
      const chave = conv.other_user_id ? String(conv.other_user_id) : `conv-${conv.id}`;
      if (!porContato.has(chave)) porContato.set(chave, conv);
    }

    return res.status(200).json(Array.from(porContato.values()));
  } catch (error) {
    console.error("Erro ao listar conversas:", error);
    return res.status(500).json({ error: error.message });
  }
};

exports._resumoUltimaMensagem = resumoUltimaMensagem; // exposto para testes
