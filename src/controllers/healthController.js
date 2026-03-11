//Este arquivo conterá a lógica que verifica se o sistema está "saudável".

const db = require('../models');

const check = async (req, res) => {
  const status = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: new Date().toISOString(),
    database: 'checking...'
  };

  try {
    // Tenta autenticar com o banco de dados
    await db.sequelize.authenticate();
    status.database = 'online';
    return res.status(200).json(status);
  } catch (error) {
    status.database = 'offline';
    status.message = error.message;
    return res.status(503).json(status);
  }
};

module.exports = { check };