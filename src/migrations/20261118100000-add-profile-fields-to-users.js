'use strict';

// Campos de perfil editáveis no mobile (tela de Perfil) que faltavam no banco:
// gênero, usuário, idioma, escolaridade e cidade/bairro. Todos opcionais.
const COLUMNS = {
  gender: { type: 'STRING' },
  username: { type: 'STRING' },
  language: { type: 'STRING' },
  education: { type: 'STRING' },
  city_neighborhood: { type: 'STRING' },
};

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('Users');
    for (const [name] of Object.entries(COLUMNS)) {
      if (!table[name]) {
        await queryInterface.addColumn('Users', name, {
          type: Sequelize.STRING,
          allowNull: true,
        });
      }
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable('Users');
    for (const name of Object.keys(COLUMNS)) {
      if (table[name]) {
        await queryInterface.removeColumn('Users', name);
      }
    }
  },
};
