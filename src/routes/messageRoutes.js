const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const authMiddleware = require('../middlewares/auth');

const uploadCloud = require('../config/cloudinary');

router.post('/mensagens', authMiddleware, messageController.sendMessage);

router.post('/mensagens/imagem', authMiddleware, uploadCloud.single('image'), messageController.sendImageMessage);

router.post('/mensagens/:id/responder', authMiddleware, messageController.responderConvite);

// Foto de visualização única: abre UMA vez (devolve a URL) e nunca mais.
router.patch('/mensagens/:id/open-view-once', authMiddleware, messageController.abrirVisualizacaoUnica);

router.get('/:id/mensagens', authMiddleware, messageController.getChatMessages);

// Confirmação de entrega/leitura (checks estilo WhatsApp).
router.post('/conversas/:id/entregue', authMiddleware, messageController.marcarComoEntregue);
router.post('/conversas/:id/ler', authMiddleware, messageController.marcarComoLida);
router.delete('/mensagens/:id', authMiddleware, messageController.deleteMessage);

module.exports = router;