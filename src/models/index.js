const Sequelize = require('sequelize');
const config = require('../config/database');

const sequelize = new Sequelize(config.database, config.username, config.password, config);

const db = {};

db.User = require('./user')(sequelize); 

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;