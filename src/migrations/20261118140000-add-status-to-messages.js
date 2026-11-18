'use strict';

// Confirmação de envio/entrega/leitura (estilo WhatsApp):
//   status: 'sent' (1 check) | 'delivered' (2 checks cinzas) | 'read' (2 azuis)
//   delivered_at / read_at: carimbos de quando cada etapa aconteceu.
// `read_at` já existia; aqui só garantimos `status` e `delivered_at`.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('messages');

    if (!table.status) {
      await queryInterface.addColumn('messages', 'status', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'sent',
      });
    }

    if (!table.delivered_at) {
      await queryInterface.addColumn('messages', 'delivered_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    // Dados existentes: quem já tinha read_at vira 'read' (e ganha
    // delivered_at), o resto fica como 'sent'. Nada é perdido.
    await queryInterface.sequelize.query(`
      UPDATE messages
         SET status = 'read',
             delivered_at = COALESCE(delivered_at, read_at)
       WHERE read_at IS NOT NULL
    `);
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable('messages');
    if (table.status) await queryInterface.removeColumn('messages', 'status');
    if (table.delivered_at) await queryInterface.removeColumn('messages', 'delivered_at');
  },
};
