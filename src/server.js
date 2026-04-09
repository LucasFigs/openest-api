const express = require('express'); // Importa o Express
const cors = require('cors'); // Importa o CORS
const helmet = require('helmet'); // Importa o Helmet
const rateLimit = require('express-rate-limit'); // Importa o rate limiter
const db = require('./models'); // Importa a configuração do Sequelize
const userRoutes = require('./routes/userRoutes'); // Importando sua organização
const healthRoutes = require('./routes/healthRoutes'); // Importando sua organização
const interactionRoutes = require('./routes/interactionRoutes'); // Importando a nova rota de interações



const app = express();

// SEGURANÇA E CONFIGURAÇÕES
app.use(helmet()); // Protege os headers HTTP
app.use(cors()); // Libera o acesso para o frontend
app.use(express.json()); // Permite receber JSON no corpo das requisições

// Aplicando Rate Limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Muitas requisições, tente mais tarde." }
});
app.use(limiter); 

// ROTAS
// Definindo o prefixo das rotas (padrão de API)
app.use('/api/users', userRoutes);
app.use('/health', healthRoutes); 
app.use('/api', interactionRoutes);// Rota direta para monitoramento

const PORT = 3000;

// Testa a conexão e sobe o servidor
db.sequelize.authenticate()
  .then(() => {
    console.log('✅ Conexão com o Banco: OK');
    console.log('📂 Estrutura de Pastas: OK');
    
    // Adicionar esta linha:
    return db.sequelize.sync({});
  })
  .then(() => {
    console.log('✅ Tabelas sincronizadas: OK');
    app.listen(PORT, () => {
      console.log(`🚀 Openest API segura rodando em http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Erro ao iniciar a Task T005:', err);
  });