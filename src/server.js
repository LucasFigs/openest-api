const express = require('express');
const db = require('./models');
const userRoutes = require('./routes/userRoutes'); // Importando sua organização
const healthRoutes = require('./routes/healthRoutes'); // Importando sua organização


const app = express();
app.use(express.json());

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
      console.log(`🚀 Openest API rodando em http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Erro ao iniciar a Task T005:', err);
  });