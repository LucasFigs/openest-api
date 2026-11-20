'use strict';

// Resposta com citação (estilo WhatsApp): a mensagem guarda qual mensagem
// ela responde. Se a original for removida do banco, o vínculo vira NULL
// (a resposta continua existindo, só sem a citação).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('messages');
    if (!table.reply_to_id) {
      await queryInterface.addColumn('messages', 'reply_to_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'messages', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
      await queryInterface.addIndex('messages', ['reply_to_id']);
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable('messages');
    if (table.reply_to_id) {
      await queryInterface.removeIndex('messages', ['reply_to_id']).catch(() => {});
      await queryInterface.removeColumn('messages', 'reply_to_id');
    }
  },
};
