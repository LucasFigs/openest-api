const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const auth = require('../middlewares/auth');

// Rota POST protegida
router.post('/denunciar', auth, reportController.createReport);

module.exports = router;