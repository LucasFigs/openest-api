require("dotenv").config();

// Configuração antiga do Sequelize para conexão com o banco de dados PostgreSQL, troque se de buxo
module.exports = {
  development: {
    dialect: "postgres",
    host: process.env.DB_HOST,
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    
    database: process.env.DB_NAME,
    define: {
      timestamps: true,
      underscored: true,
    },
  },
};

// Configuração para usar DATABASE_URL, caso esteja disponível (como em ambientes de produção)

// console.log("Tentando conectar com o usuário:", process.env.DB_USER);
// console.log("No host:", process.env.DB_HOST);

// module.exports = {
//   development: {
//     use_env_variable: "DATABASE_URL",
//     dialect: "postgres",
//     dialectOptions: {
//       ssl: {
//         require: true,
//         rejectUnauthorized: false
//       }
//     },
//     define: {
//       timestamps: true,
//       underscored: true,
//     }
//   }
// };