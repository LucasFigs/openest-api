const db = require('../models');
const { DataTypes } = require('sequelize');

// --- CARREGAMENTO MANUAL DOS MODELOS ---

let Message = db.Message || db.sequelize.models.Message;
if (!Message) {
  const messageModel = require('../models/message');
  Message = messageModel(db.sequelize, DataTypes);
}

let Conversation = db.Conversation || db.sequelize.models.Conversation;
if (!Conversation) {
  const conversationModel = require('../models/conversation');
  Conversation = conversationModel(db.sequelize, DataTypes);
}

// (Modo Discreto)
let Match = db.Match || db.sequelize.models.Match;
if (!Match) {
  const matchModel = require('../models/match');
  Match = matchModel(db.sequelize, DataTypes);
}

let User = db.User || db.sequelize.models.User;
if (!User) {
  const userModel = require('../models/user');
  User = userModel(db.sequelize, DataTypes);
}

// --- FIM DO CARREGAMENTO ---

exports.sendMessage = async (req, res) => {
  try {
    const { conversation_id, content } = req.body;
    const sender_id = req.user.id;

    // 1. Validar a conversa (Busca simples para evitar erro de associação)
    const conversation = await Conversation.findByPk(conversation_id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversa não encontrada" });
    }

    // 2. Buscar o Match para encontrar o destinatário (Task #63)
    const match = await Match.findByPk(conversation.match_id);
    if (!match) {
      return res.status(404).json({ message: "Match não encontrado" });
    }

    // 3. Salvar mensagem no banco
    const newMessage = await Message.create({
      conversation_id,
      sender_id,
      content
    });

    // --- LÓGICA MODO DISCRETO ---
    
    const recipientId = match.user1_id === sender_id ? match.user2_id : match.user1_id;
    const recipient = await User.findByPk(recipientId);

    let notificationTitle = req.user.name; 
    let notificationBody = content;        

    if (recipient && recipient.modo_discreto) {
      notificationTitle = "Nova mensagem";
      notificationBody = "Você recebeu uma nova mensagem";
      console.log("🔒 MODO DISCRETO ATIVADO: Ocultando dados na notificação.");
    } else {
      console.log("📢 MODO NORMAL: Enviando notificação com nome e conteúdo.");
    }

    // --- EMISSÃO DE EVENTOS ---

    const io = req.app.get('socketio'); 

    // Envia a mensagem real para o chat aberto
    io.to(`chat_${conversation_id}`).emit('new_message', newMessage);

    // Envia a notificação (mascarada ou não) para o destinatário
    io.to(`user_${recipientId}`).emit('notification', {
      title: notificationTitle,
      body: notificationBody,
      conversation_id
    });

    return res.status(201).json(newMessage);
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
    return res.status(500).json({ error: error.message });
  }
};

// --- TASK #62: PAGINAÇÃO (Mantida e Protegida) ---
exports.getChatMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { count, rows } = await Message.findAndCountAll({
      where: { conversation_id: id },
      limit,
      offset,
      order: [['created_at', 'DESC']]
    });

    const hasNext = count > (offset + limit);

    return res.json({
      messages: rows,
      pagination: { total: count, page, limit, hasNext }
    });
  } catch (error) {
    console.error("Erro na paginação:", error);
    return res.status(500).json({ error: error.message });
  }
};