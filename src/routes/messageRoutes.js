const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const authMiddleware = require('../middlewares/auth');

router.post('/mensagens', authMiddleware, messageController.sendMessage);

module.exports = router;