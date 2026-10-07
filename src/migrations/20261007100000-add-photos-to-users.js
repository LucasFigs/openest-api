'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // T021 — galeria de múltiplas fotos de perfil: lista JSONB ordenada onde
    // a posição 0 é a foto principal (espelhada no foto_url).
    await queryInterface.addColumn('Users', 'photos', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
    });

    // Compatibilidade: usuários que já têm foto principal ganham a lista
    // inicial com essa URL na posição 0 (mesma ordem exibida no Card).
    await queryInterface.sequelize.query(`
      UPDATE "Users"
      SET photos = jsonb_build_array(foto_url)
      WHERE photos = '[]'::jsonb
        AND foto_url IS NOT NULL
        AND foto_url <> '';
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Users', 'photos');
  },
};
