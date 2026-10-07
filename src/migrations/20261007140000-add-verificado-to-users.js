'use strict';

// T023 — Verificação de selfie: selo "Verificado" no perfil e no Card.
// A coluna verificado alimenta o badge do app (obterPerfil) e do Discovery
// web (user.verificado); selfie_url guarda a última selfie enviada.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Users', 'verificado', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.addColumn('Users', 'selfie_url', {
      type: Sequelize.STRING,
      allowNull: true
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Users', 'selfie_url');
    await queryInterface.removeColumn('Users', 'verificado');
  }
};
