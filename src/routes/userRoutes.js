const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/auth');
const upload = require('../services/uploadService');

// Health check
router.get('/health', (req, res) => {
  res.json({ status: "Operacional", message: "Rotas do Openest OK!" });
});

// Rotas públicas (sem autenticação)
router.post('/register',       userController.register);
router.post('/login',          userController.login);
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password', userController.resetPassword);

// Rotas protegidas (com autenticação)
router.get( '/perfil',         authMiddleware, userController.obterPerfil);
router.put( '/perfil',         authMiddleware, userController.atualizarPerfil);
router.get( '/buscar',         authMiddleware, userController.buscarPerfis);
router.get( '/exportar-dados', authMiddleware, userController.exportUserData);
router.delete('/conta',        authMiddleware, userController.deleteAccount);

// ✅ Upload de foto — rota única com auth + multer + controller
// upload.single('image') processa o arquivo e popula req.file com os dados do Cloudinary
router.post('/upload-photo',   authMiddleware, upload.single('image'), userController.uploadPhoto);

module.exports = router;