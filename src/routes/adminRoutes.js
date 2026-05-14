const express = require('express');
const router = express.Router();

// Importe o seu controller
const { getMonitoramento } = require('../controllers/adminController');

// Importe os seus middlewares exatos
const auth = require('../middlewares/auth'); 
const admin = require('../middlewares/admin'); 

// Rota GET /api/admin/monitoramento (protegida)
// A execução é em cadeia: primeiro verifica o token (auth), depois se é admin (admin), e por fim chama o controller.
router.get('/monitoramento', auth, admin, getMonitoramento);

module.exports = router;