const express = require('express');
const router = express.Router();
const interactionController = require('../controllers/interactionController');
const authMiddleware = require('../middlewares/auth');

// Rota para curtir um perfil
router.post('/curtir/:usuarioId', authMiddleware, interactionController.curtirPerfil);

module.exports = router;