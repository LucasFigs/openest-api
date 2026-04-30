const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const auth = require('../middlewares/auth'); // O nome que deu certo!

router.get('/conversas', auth, conversationController.listConversations);

module.exports = router;