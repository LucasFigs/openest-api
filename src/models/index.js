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

// 1º PASSO: Criar a conexão com o banco PRIMEIRO
const sequelize = new Sequelize(
  dbConfig.database, 
  dbConfig.username, 
  dbConfig.password, 
  dbConfig 
);

// 2º PASSO: Criar a "caixa" vazia
const db = {};

// 3º PASSO: Colocar os modelos dentro da caixa (agora a caixa e a conexão já existem!)
db.User = require('./user')(sequelize); 
db.Interaction = require('./interaction')(sequelize, Sequelize);
db.Match = require('./match')(sequelize, Sequelize);
db.Conversation = require('./conversation')(sequelize, Sequelize);
db.Message = require('./message')(sequelize, Sequelize);

// 4º PASSO: Executar as associações (ligar as tabelas umas às outras)
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// 5º PASSO: Finalizar e exportar
db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;

