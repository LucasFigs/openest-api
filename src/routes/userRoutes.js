const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const uploadCloud = require('../config/cloudinary');

// Rota de teste para confirmar que a estrutura funciona
router.get('/health', (req, res) => {
  res.json({ 
    status: "Operacional",
    message: "Estrutura de rotas do Openest configurada com sucesso!" 
    
  });
});

// Rota para registrar um novo usuário
router.post('/register', userController.register);
router.post('/login', userController.login);

// Rota temporária para testar o upload
router.post('/upload-test', uploadCloud.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Nenhuma imagem enviada." });
  }
  // O Cloudinary retorna a URL da imagem em req.file.path
  res.json({ url: req.file.path });
});


module.exports = router;