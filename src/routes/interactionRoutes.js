const express = require('express');
const router = express.Router();
const interactionController = require('../controllers/interactionController');
const authMiddleware = require('../middlewares/auth'); //VerifyToken Middleware

// Rota para curtir um perfil
router.post('/curtir/:usuarioId', authMiddleware, interactionController.curtirPerfil);
router.post('/passar/:usuarioId', authMiddleware, interactionController.passarPerfil);

module.exports = router;