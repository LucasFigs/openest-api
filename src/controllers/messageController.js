const db = require("../models");
const { DataTypes } = require("sequelize");

// --- CARREGAMENTO MANUAL DOS MODELOS ---

let Message = db.Message || db.sequelize.models.Message;
if (!Message) {
  const messageModel = require("../models/message");
  Message = messageModel(db.sequelize, DataTypes);
}

let Conversation = db.Conversation || db.sequelize.models.Conversation;
if (!Conversation) {
  const conversationModel = require("../models/conversation");
  Conversation = conversationModel(db.sequelize, DataTypes);
}

let Match = db.Match || db.sequelize.models.Match;
if (!Match) {
  const matchModel = require("../models/match");
  Match = matchModel(db.sequelize, DataTypes);
}

let User = db.User || db.sequelize.models.User;
if (!User) {
  const userModel = require("../models/user");
  User = userModel(db.sequelize, DataTypes);
}

// --- FIM DO CARREGAMENTO ---

exports.sendMessage = async (req, res) => {
  try {
    const { conversation_id, content } = req.body;
    const sender_id = req.user.id;

    if (isNaN(conversation_id)) {
      return res.status(400).json({ error: "ID de conversa inválido." });
    }

    const conversation = await Conversation.findByPk(conversation_id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversa não encontrada" });
    }

    const match = await Match.findByPk(conversation.match_id);
    if (!match) {
      return res.status(404).json({ message: "Match não encontrado" });
    }

    const newMessage = await Message.create({
      conversation_id,
      sender_id,
      content,
    });

    const recipientId =
      match.user1_id === sender_id ? match.user2_id : match.user1_id;
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

    const io = req.app.get("socketio");

    io.to(`chat_${conversation_id}`).emit("new_message", newMessage);

    io.to(`user_${recipientId}`).emit("notification", {
      title: notificationTitle,
      body: notificationBody,
      conversation_id,
    });

    return res.status(201).json(newMessage);
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
    return res.status(500).json({ error: error.message });
  }
};

exports.getChatMessages = async (req, res) => {
  try {
    const { id } = req.params;

    // 🔥 O ESCUDO PRINCIPAL: Barrar "lista" ou IDs falsos
    if (isNaN(id)) {
      return res
        .status(400)
        .json({ error: "O ID da conversa deve ser um número válido." });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { count, rows } = await Message.findAndCountAll({
      where: { conversation_id: id },
      limit,
      offset,
      order: [["id", "DESC"]],
    });

    const hasNext = count > offset + limit;

    return res.json({
      messages: rows,
      pagination: { total: count, page, limit, hasNext },
    });
  } catch (error) {
    console.error("Erro na paginação:", error);
    return res.status(500).json({ error: error.message });
  }
};
