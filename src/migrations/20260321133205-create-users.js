'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Primeiro cria a tabela
    await queryInterface.createTable('Users', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      password_hash: {
        type: Sequelize.STRING,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      birth_date: Sequelize.DATEONLY,
      bio: Sequelize.TEXT,
      status_relacionamento: Sequelize.STRING, 
      modo_discreto: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_admin: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      foto_url: Sequelize.STRING,
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      deleted_at: {
        type: Sequelize.DATE
      }
    });

await queryInterface.addIndex('Users', ['email'], { name: 'users_email_v2' });
await queryInterface.addIndex('Users', ['status_relacionamento'], { name: 'users_status_rel_v2' });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Users');
  }
};