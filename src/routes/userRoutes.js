const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const uploadCloud = require('../config/cloudinary');
const authMiddleware = require('../middlewares/auth');
const upload = require('../services/uploadService');
const verifyToken = require('../middlewares/auth'); //<---- verificar se vai ocorrer problemas com isto

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
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password', userController.resetPassword);
router.post('/upload-photo', verifyToken, upload.single('image'), userController.uploadPhoto);
router.get('/perfil', authMiddleware, userController.obterPerfil);
router.put('/perfil', authMiddleware, userController.atualizarPerfil);
router.get('/buscar', authMiddleware, userController.buscarPerfis);

// Rota temporária para testar o upload
router.post('/upload-test', authMiddleware, uploadCloud.single('image'), (req, res) => {

  if (!req.file) {
    return res.status(400).json({ error: "Nenhuma imagem enviada." });
  }

  //modificado para mostrar o ID do usuário logado no console e retornar no JSON de resposta
  // O log vai aqui, logo após passar pelo middleware de autenticação
    console.log("ID do usuário logado:", req.userId);

    // O novo res.json com as informações completas
    res.json({ 
        message: "Upload autorizado!",
        url: req.file.path,
        userLogado: req.userId
    });
});

// Rota de upload de foto de perfil
// 'image' é o nome do campo que o frontend vai ter que mandar
router.post('/upload-photo', upload.single('image'), (req, res) => {
  try {
    // Se deu certo, o link da imagem está aqui:
    const imageUrl = req.file.path; 
    
    res.json({
      message: "Upload realizado com sucesso!",
      url: imageUrl // Essa é a URL pública que o critério de aceite pede!
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao fazer upload da imagem." });
  }
});


module.exports = router;