const Sequelize = require('sequelize');
const config = require('../config/database');


// Pegamos as configs de dentro da chave 'development' que criamos no database.js
const dbConfig = config.development; 

const sequelize = new Sequelize(
  dbConfig.database, 
  dbConfig.username, 
  dbConfig.password, 
  dbConfig // Aqui dentro está o 'dialect: postgres' que ele tanto quer
);

const db = {};

// Importa o modelo de usuário que criamos na T014
db.User = require('./user')(sequelize); 
//mudei so isso aqui
db.Interaction = require('./interaction')(sequelize, Sequelize);
db.Match = require('./match')(sequelize, Sequelize);


db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;