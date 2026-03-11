const express = require('express');
const db = require('./models');
const app = express();

db.sequelize.authenticate()
  .then(() => {
    console.log('✅ Conexão com o PostgreSQL estabelecida!');
    app.listen(3000, () => console.log('🚀 Servidor rodando na porta 3000'));
  })
  .catch(err => console.error('❌ Erro de conexão:', err));