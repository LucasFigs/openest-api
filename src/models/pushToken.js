'use strict';
const { Model } = require('sequelize');

// T048 — Expo Push Tokens dos aparelhos de cada usuário.
// Tabela própria (e não uma coluna em Users) para:
//   • suportar mais de um aparelho por usuário;
//   • ser criada sozinha pelo sequelize.sync() do server.js, sem exigir
//     migration/ALTER TABLE em bancos que já existem.
module.exports = (sequelize, DataTypes) => {
  class PushToken extends Model {}

  PushToken.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    platform: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'PushToken',
    tableName: 'push_tokens',
    underscored: true,
    indexes: [{ fields: ['user_id'] }],
  });

  return PushToken;
};
