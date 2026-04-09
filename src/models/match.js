// models/match.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Match extends Model {
    static associate(models) {
      this.belongsTo(models.User, { foreignKey: 'user1_id', as: 'user1' });
      this.belongsTo(models.User, { foreignKey: 'user2_id', as: 'user2' });
    }
  }
  Match.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user1_id: DataTypes.UUID,
    user2_id: DataTypes.UUID
  }, {
    sequelize,
    modelName: 'Match',
    underscored: true,
  });
  return Match;
};