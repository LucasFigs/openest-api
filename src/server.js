const express = require("express"); // Framework para criar o servidor HTTP
const cors = require("cors"); // Middleware para habilitar CORS (Cross-Origin Resource Sharing)
const helmet = require("helmet"); // Middleware para segurança HTTP, adiciona cabeçalhos de segurança
const rateLimit = require("express-rate-limit"); // Middleware para limitar o número de requisições, prevenindo ataques de força bruta
const http = require("http");
const os = require("os"); // lista os IPs da rede local no log de inicialização // Módulo nativo do Node.js para criar um servidor HTTP, necessário para integrar com Socket.IO
const { Server } = require("socket.io"); // Biblioteca para WebSockets, permitindo comunicação em tempo real entre cliente e servidor
const db = require("./models"); // Importa o modelo do banco de dados, incluindo a conexão e os modelos definidos
const userRoutes = require("./routes/userRoutes"); // Importa as rotas relacionadas aos usuários, como registro e login
const healthRoutes = require("./routes/healthRoutes"); // Importa as rotas para verificação de saúde do servidor, útil para monitoramento e deploy
const interactionRoutes = require("./routes/interactionRoutes"); // Importa as rotas relacionadas às interações, como mensagens e conversas
const messageRoutes = require('./routes/messageRoutes'); // Importa as rotas relacionadas às mensagens, incluindo o envio de mensagens
const conversationRoutes = require('./routes/conversationRoutes'); // Importa as rotas relacionadas às conversas, como listar conversas do usuário
const reportRoutes = require('./routes/reportRoutes'); // Importa as rotas relacionadas às denúncias, permitindo que os usuários denunciem outros perfis
const adminRoutes = require('./routes/adminRoutes'); // Importa as rotas relacionadas ao painel de administração, incluindo o endpoint de monitoramento
const swaggerUi = require('swagger-ui-express'); // Biblioteca para servir a interface do Swagger, que é uma ferramenta de documentação de APIs
const swaggerJsdoc = require('swagger-jsdoc'); // Biblioteca para gerar a especificação do Swagger a partir de comentários JSDoc nas rotas, facilitando a documentação automática da API
const eventRoutes = require('./routes/eventroutes');
const { setupSocket } = require("./socket"); // T045 — eventos de chat em tempo real


const app = express();

// SEGURANÇA E CONFIGURAÇÕES
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/api/events', eventRoutes);


// 👇 CONFIGURAÇÃO DO SWAGGER 👇
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'Openest API',
          version: '1.0.0',
          description: 'Documentação das rotas do backend',
        },
        servers: [
          {
            url: 'http://localhost:3000', 
          },
        ],
        // 🔥 A MÁGICA DO CADEADO ENTRA AQUI:
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
        security: [
          {
            bearerAuth: [],
          },
        ],
      },
      apis: ['./src/routes/*.js'], 
    };

    const swaggerSpec = swaggerJsdoc(swaggerOptions);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));;
    // 👆 FIM DA CONFIGURAÇÃO DO SWAGGER 👆

// ROTAS
app.use('/api', conversationRoutes);
app.use('/api', messageRoutes);
app.use('/api', reportRoutes);
app.use('/api/admin', adminRoutes);

// Aplicando Rate Limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: { message: "Muitas requisições, tente mais tarde." },
});

// CONFIGURAÇÃO DO SOCKET.IO
const server = http.createServer(app); // Cria o servidor HTTP para o Socket
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Configuração para acessar o Socket.IO a partir dos controllers
app.use(limiter);
app.set("socketio", io);

// ROTAS
app.use("/api/users", userRoutes);
app.use("/health", healthRoutes);
app.use("/api", interactionRoutes);
app.use("/api", messageRoutes);

// Autenticação + eventos do Socket.IO (T045/T048) — ver src/socket.js
setupSocket(io);

// Porta e host: 0.0.0.0 aceita conexões da rede local (celular Android no
// mesmo Wi-Fi), não só do próprio notebook.
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Endereços IPv4 da máquina na rede (ex.: 192.168.1.4) — é o que vai no
// EXPO_PUBLIC_API_URL do openest-mobile.
function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address);
}

// Sincronização e Início do Servidor
db.sequelize
  .authenticate()
  .then(() => {
    console.log("✅ Conexão com o Banco: OK");
    return db.sequelize.sync({});
  })
  .then(() => {
    console.log("✅ Tabelas sincronizadas: OK");
    // 'server.listen' em vez de 'app.listen'
    server.listen(PORT, HOST, () => {
      console.log(`🚀 Openest API com WebSockets rodando em http://localhost:${PORT}`);
      getLanAddresses().forEach((ip) => {
        console.log(`📱 Na rede local (mobile): http://${ip}:${PORT}`);
      });
    });
  })
  .catch((err) => {
    console.error("❌ Erro ao iniciar servidor:", err);
  });
