const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const authMiddleware = require('../middlewares/auth');

// GET /api/events/meus-encontros?mes=6&ano=2026
router.get('/meus-encontros', authMiddleware, eventController.meusEncontros);

module.exports = router;