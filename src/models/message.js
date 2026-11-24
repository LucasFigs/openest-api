'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Message extends Model {
    static associate(models) {
      // Uma mensagem pertence a uma conversa
      this.belongsTo(models.Conversation, { foreignKey: 'conversation_id', as: 'conversation' });
      // Uma mensagem pertence a um remetente (usuário)
      this.belongsTo(models.User, { foreignKey: 'sender_id', as: 'sender' });
      // Resposta com citação: a mensagem que esta responde.
      this.belongsTo(models.Message, { foreignKey: 'reply_to_id', as: 'replyTo' });
    }
  }

  Message.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    conversation_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sender_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    // Confirmação de entrega/leitura (estilo WhatsApp):
    // 'sent' = 1 check | 'delivered' = 2 checks cinzas | 'read' = 2 azuis.
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'sent'
    },
    delivered_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    read_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Foto de visualização única: o destinatário abre UMA vez e acabou.
    is_view_once: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    is_opened: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    viewed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Legenda opcional de uma foto.
    caption: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // Quando o DESTINATÁRIO viu a mensagem (independe do Modo Discreto, que
    // só esconde o recibo do remetente). Alimenta o contador de não lidas.
    seen_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Mensagem citada (resposta estilo WhatsApp). NULL = não é resposta.
    reply_to_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Message',
    tableName: 'messages',
    underscored: true,
    updatedAt: false // Task só pede created_at
  });

  return Message;
};