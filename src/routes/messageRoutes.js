const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const authMiddleware = require('../middlewares/auth');

router.post('/mensagens', authMiddleware, messageController.sendMessage);

router.get('/:id/mensagens', authMiddleware, messageController.getChatMessages);
// Adicione esta linha junto com as suas outras rotas de mensagem:
router.delete('/mensagens/:id', authMiddleware, messageController.deleteMessage);

module.exports = router;