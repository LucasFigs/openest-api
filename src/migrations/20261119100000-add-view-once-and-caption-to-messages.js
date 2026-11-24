'use strict';

// Fotos de visualização única + legenda + "visto pelo destinatário".
//
//   is_view_once  → a foto só pode ser aberta UMA vez pelo destinatário
//   is_opened     → já foi aberta (bloqueia novas aberturas)
//   viewed_at     → quando foi aberta
//   caption       → legenda opcional de uma foto
//   seen_at       → quando o DESTINATÁRIO viu a mensagem. É separado do
//                   status/read_at (que é o recibo mostrado ao remetente e
//                   pode ser bloqueado pelo Modo Discreto). É o que alimenta
//                   o contador de não lidas da lista de conversas.
//
// Todas as colunas têm default seguro: nenhuma mensagem existente quebra.
const COLUNAS = (Sequelize) => ({
  is_view_once: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
  is_opened: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
  viewed_at: { type: Sequelize.DATE, allowNull: true },
  caption: { type: Sequelize.TEXT, allowNull: true },
  seen_at: { type: Sequelize.DATE, allowNull: true },
});

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('messages');
    for (const [nome, definicao] of Object.entries(COLUNAS(Sequelize))) {
      if (!table[nome]) await queryInterface.addColumn('messages', nome, definicao);
    }
    // Quem já tinha recibo de leitura, obviamente já foi visto.
    await queryInterface.sequelize.query(
      'UPDATE messages SET seen_at = read_at WHERE seen_at IS NULL AND read_at IS NOT NULL'
    );
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable('messages');
    for (const nome of ['is_view_once', 'is_opened', 'viewed_at', 'caption', 'seen_at']) {
      if (table[nome]) await queryInterface.removeColumn('messages', nome);
    }
  },
};
