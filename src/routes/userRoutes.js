const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Rota de teste para confirmar que a estrutura funciona
router.get('/health', (req, res) => {
  res.json({ 
    status: "Operacional",
    message: "Estrutura de rotas do Openest configurada com sucesso!" 
    
  });
});

// Rota para registrar um novo usuário
router.post('/register', userController.register);

module.exports = router;