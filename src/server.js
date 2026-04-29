const express = require('express'); // Framework para criar o servidor HTTP
const cors = require('cors'); // Middleware para habilitar CORS (Cross-Origin Resource Sharing)
const helmet = require('helmet'); // Middleware para segurança HTTP, adiciona cabeçalhos de segurança
const rateLimit = require('express-rate-limit'); // Middleware para limitar o número de requisições, prevenindo ataques de força bruta
const http = require('http'); // Módulo nativo do Node.js para criar um servidor HTTP, necessário para integrar com Socket.IO
const { Server } = require('socket.io'); // Biblioteca para WebSockets, permitindo comunicação em tempo real entre cliente e servidor
const db = require('./models'); // Importa o modelo do banco de dados, incluindo a conexão e os modelos definidos
const userRoutes = require('./routes/userRoutes'); // Importa as rotas relacionadas aos usuários, como registro e login
const healthRoutes = require('./routes/healthRoutes'); // Importa as rotas para verificação de saúde do servidor, útil para monitoramento e deploy
const interactionRoutes = require('./routes/interactionRoutes'); // Importa as rotas relacionadas às interações, como mensagens e conversas

const app = express();

// SEGURANÇA E CONFIGURAÇÕES
app.use(helmet());
app.use(cors());
app.use(express.json());

// Aplicando Rate Limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Muitas requisições, tente mais tarde." }
});
app.use(limiter);

// ROTAS
app.use('/api/users', userRoutes);
app.use('/health', healthRoutes);
app.use('/api', interactionRoutes);

// CONFIGURAÇÃO DO SOCKET.IO
const server = http.createServer(app); // Cria o servidor HTTP para o Socket
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// Autenticação básica via Socket
io.use((socket, next) => {
  const token = socket.handshake.auth.token; // Recebe o JWT do frontend
  if (!token) return next(new Error("Erro de autenticação"));
  // Aqui o servidor valida o token antes de permitir a conexão real
  next();
});

io.on('connection', (socket) => {
  console.log('📡 Novo cliente conectado ao WebSocket:', socket.id);

  // Entrar em uma sala específica (Conversation Room)
  socket.on('join_conversation', (conversationId) => {
    socket.join(`chat_${conversationId}`);
    console.log(`💬 Usuário entrou no chat: ${conversationId}`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Cliente desconectado');
  });
});

const PORT = 3000;

// Sincronização e Início do Servidor
db.sequelize.authenticate()
  .then(() => {
    console.log('✅ Conexão com o Banco: OK');
    return db.sequelize.sync({});
  })
  .then(() => {
    console.log('✅ Tabelas sincronizadas: OK');
  // 'server.listen' em vez de 'app.listen'
    server.listen(PORT, () => {
      console.log(`🚀 Openest API com WebSockets rodando em http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Erro ao iniciar servidor:', err);
  });