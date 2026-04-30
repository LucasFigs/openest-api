const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const auth = require('../middlewares/auth');
const admin = require('../middlewares/admin');

// Rota POST protegida
router.post('/denunciar', auth, reportController.createReport);
router.get('/admin/denuncias', auth, admin, reportController.listReports);

module.exports = router;