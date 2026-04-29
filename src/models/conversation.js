'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Conversation extends Model {
    static associate(models) {
      // Relacionamento inverso: A conversa pertence a um Match
      this.belongsTo(models.Match, { foreignKey: 'match_id', as: 'match' });
    }
  }

  Conversation.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    match_id: {
      // Ajustado para UUID para bater com o seu modelo Match
      type: DataTypes.UUID, 
      allowNull: false,
      references: {
        model: 'Matches',
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'Conversation',
    tableName: 'conversations',
    underscored: true,
  });

  return Conversation;
};