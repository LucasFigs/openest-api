'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Message extends Model {
    static associate(models) {
      // Uma mensagem pertence a uma conversa
      this.belongsTo(models.Conversation, { foreignKey: 'conversation_id', as: 'conversation' });
      // Uma mensagem pertence a um remetente (usuário)
      this.belongsTo(models.User, { foreignKey: 'sender_id', as: 'sender' });
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
    read_at: {
      type: DataTypes.DATE,
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