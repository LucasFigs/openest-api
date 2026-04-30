const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const auth = require('../middlewares/auth');
const admin = require('../middlewares/admin');

// Rota POST protegida
router.post('/denunciar', auth, reportController.createReport);
router.get('/admin/denuncias', auth, admin, reportController.listReports);
router.post('/admin/denuncias/:id/banir', auth, admin, reportController.banUser);
router.post('/admin/denuncias/:id/ignorar', auth, admin, reportController.dismissReport);
router.post('/admin/denuncias/:id/aviso', auth, admin, reportController.sendWarning);

module.exports = router;