const express = require('express');
const cors = require('cors'); // Importa o CORS
const helmet = require('helmet'); // Importa o Helmet
const db = require('./models');
const userRoutes = require('./routes/userRoutes'); // Importando sua organização
const healthRoutes = require('./routes/healthRoutes'); // Importando sua organização


const app = express();

// SEGURANÇA E CONFIGURAÇÕES
app.use(helmet()); // Protege os headers HTTP
app.use(cors()); // Libera o acesso para o frontend
app.use(express.json());

// ROTAS
// Definindo o prefixo das rotas (padrão de API)
app.use('/api/users', userRoutes);
app.use('/health', healthRoutes); // Rota direta para monitoramento

const PORT = 3000;

// Testa a conexão e sobe o servidor
db.sequelize.authenticate()
  .then(() => {
    console.log('✅ Conexão com o Banco: OK');
    console.log('📂 Estrutura de Pastas: OK');
    app.listen(PORT, () => {
      console.log(`🚀 Openest API segura rodando em http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Erro ao iniciar a Task T005:', err);
  });