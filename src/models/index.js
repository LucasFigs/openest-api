//SUPABASE DB
// const Sequelize = require('sequelize');
// const config = require('../config/database');

// const dbConfig = config.development;

// // Usa DATABASE_URL se disponível, senão usa as variáveis separadas
// const sequelize = process.env.DATABASE_URL
//   ? new Sequelize(process.env.DATABASE_URL, {
//       dialect: 'postgres',
//       dialectOptions: {
//         ssl: {
//           require: true,
//           rejectUnauthorized: false
//         }
//       },
//       define: {
//         timestamps: true,
//         underscored: true,
//       }
//     })
//   : new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, dbConfig);

// const db = {};

// db.User = require('./user')(sequelize); 
// db.Interaction = require('./interaction')(sequelize, Sequelize);
// db.Match = require('./match')(sequelize, Sequelize);

// db.sequelize = sequelize;
// db.Sequelize = Sequelize;

// module.exports = db;


// LOCAL DB
const Sequelize = require('sequelize');
const config = require('../config/database');


// Pegamos as configs de dentro da chave 'development' que criamos no database.js
const dbConfig = config.development; 

const sequelize = new Sequelize(
  dbConfig.database, 
  dbConfig.username, 
  dbConfig.password, 
  dbConfig // Aqui dentro está o 'dialect: postgres' 
);

const db = {};

// Importa o modelo de usuário que criamos, passando a instância do Sequelize para ele. Assim, o modelo pode se registrar corretamente.
db.User = require('./user')(sequelize); 
//mudei so isso aqui
db.Interaction = require('./interaction')(sequelize, Sequelize);
db.Match = require('./match')(sequelize, Sequelize);


db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;

