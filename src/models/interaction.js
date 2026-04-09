'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Interaction extends Model {
    static associate(models) {
      // Associações: Uma interação pertence a um usuário que curtiu e a um que foi curtido
      this.belongsTo(models.User, { foreignKey: 'from_user_id', as: 'sender' });
      this.belongsTo(models.User, { foreignKey: 'to_user_id', as: 'receiver' });
    }
  };

  Interaction.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    from_user_id: DataTypes.UUID,
    to_user_id: DataTypes.UUID,
    type: DataTypes.STRING // 'like' ou 'pass'
  }, {
    sequelize,
    modelName: 'Interaction',
    underscored: true, // Garante que use created_at no banco
  });

  return Interaction;
};