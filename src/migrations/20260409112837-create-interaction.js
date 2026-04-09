'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Interactions', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4
      },
      from_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' }, // FK para Users
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      to_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' }, // FK para Users
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      type: {
        type: Sequelize.STRING, // 'like' ou 'pass'
        allowNull: false
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('now')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('now')
      }
    });

    // Cria índices para performance (critério de aceite)
    await queryInterface.addIndex('Interactions', ['from_user_id']);
    await queryInterface.addIndex('Interactions', ['to_user_id']);
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Interactions');
  }
};