const express = require('express');
const router = express.Router();
const interactionController = require('../controllers/interactionController');
const authMiddleware = require('../middlewares/auth'); //VerifyToken Middleware

// Rota para curtir um perfil
router.post('/curtir/:usuarioId', authMiddleware, interactionController.curtirPerfil);
router.post('/passar/:usuarioId', authMiddleware, interactionController.passarPerfil);

// ✅ T034 — Desfazer (undo) da última interação com um perfil.
// DELETE /api/desfazer/:usuarioId — remove o último like/pass registrado
// pelo usuário logado e o match/conversa vazia originados por esse like.
router.delete('/desfazer/:usuarioId', authMiddleware, interactionController.desfazerInteracao);

module.exports = router;