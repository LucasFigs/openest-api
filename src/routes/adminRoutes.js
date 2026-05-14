const express = require('express');
const router = express.Router();

const { 
  getMonitoramento,
  getKpiUsuarios,
  getKpiMatches,
  getKpiDenuncias,
  getKpiEngajamento
} = require('../controllers/adminController');

// Importe os seus middlewares exatos
const auth = require('../middlewares/auth'); 
const admin = require('../middlewares/admin'); 

// Rota GET /api/admin/monitoramento
// A execução é em cadeia: primeiro verifica o token (auth), depois se é admin (admin), e por fim chama o controller.
router.get('/monitoramento', auth, admin, getMonitoramento);

// Novas Rotas GET para os KPIs (protegidas - Task #66)
router.get('/kpis/usuarios', auth, admin, getKpiUsuarios);
router.get('/kpis/matches', auth, admin, getKpiMatches);
router.get('/kpis/denuncias', auth, admin, getKpiDenuncias);
router.get('/kpis/engajamento', auth, admin, getKpiEngajamento);

module.exports = router;