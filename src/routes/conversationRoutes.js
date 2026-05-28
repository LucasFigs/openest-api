const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const auth = require('../middlewares/auth');

/**
 * @swagger
 * /api/conversas:
 *   get:
 *     summary: Retorna a lista de conversas do usuário logado
 *     tags: 
 *       - Conversas
 *     responses:
 *       200:
 *         description: Lista de conversas carregada com sucesso
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno do servidor
 */
router.get('/conversas', auth, conversationController.listConversations);

module.exports = router;