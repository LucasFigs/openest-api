const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const authMiddleware = require('../middlewares/auth');

const uploadCloud = require('../config/cloudinary');

router.post('/mensagens', authMiddleware, messageController.sendMessage);

router.post('/mensagens/imagem', authMiddleware, uploadCloud.single('image'), messageController.sendImageMessage);

router.post('/mensagens/:id/responder', authMiddleware, messageController.responderConvite);

router.get('/:id/mensagens', authMiddleware, messageController.getChatMessages);
router.delete('/mensagens/:id', authMiddleware, messageController.deleteMessage);

module.exports = router;