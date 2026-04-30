'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Report extends Model {
    static associate(models) {
      // Associações com a tabela de Usuários
      Report.belongsTo(models.User, { foreignKey: 'reporter_id', as: 'Reporter' });
      Report.belongsTo(models.User, { foreignKey: 'reported_id', as: 'ReportedUser' });
      Report.belongsTo(models.User, { foreignKey: 'reviewed_by', as: 'ReviewerAdmin' });
    }
  }

  Report.init({
    id: {
      type: DataTypes.INTEGER, // Use DataTypes.UUID se os seus IDs de usuário forem UUID
      primaryKey: true,
      autoIncrement: true,
    },
    reporter_id: {
      type: DataTypes.INTEGER,
      allowNull: true, // true para permitir denúncias 100% anônimas (sem usuário logado)
    },
    reported_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'reviewed', 'dismissed', 'banned'),
      defaultValue: 'pending',
      allowNull: false,
    },
    reviewed_at: {
      type: DataTypes.DATE, // Timestamp
      allowNull: true,
    },
    reviewed_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    }
  }, {
    sequelize,
    modelName: 'Report',
    tableName: 'reports',
    underscored: true,
    timestamps: true, // Já cria created_at e updated_at automaticamente
    createdAt: 'created_at',
    updatedAt: false, // Desabilitamos o updatedAt padrão pois temos o reviewed_at
    indexes: [
      {
        fields: ['reported_id'] // Índice exigido na Task
      },
      {
        fields: ['status'] // Índice exigido na Task
      }
    ]
  });

  return Report;
};