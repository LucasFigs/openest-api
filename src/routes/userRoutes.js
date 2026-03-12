const express = require('express');
const router = express.Router();

// Rota de teste para confirmar que a estrutura funciona
router.get('/health', (req, res) => {
  res.json({ 
    status: "Operacional",
    message: "Estrutura de rotas do Openest configurada com sucesso!" 
  });
});

module.exports = router;