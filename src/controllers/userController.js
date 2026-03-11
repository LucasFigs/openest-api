const bcrypt = require('bcrypt');
const db = require('../models');

// Função para cadastrar usuário com senha protegida
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Gerar o "salt" (tempero para a senha) e o Hash
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Aqui futuramente faremos o db.User.create com a hashedPassword
    console.log('Senha original:', password);
    console.log('Senha criptografada:', hashedPassword);

    return res.status(201).json({ 
      message: "Usuário preparado para cadastro seguro!",
      hashedPassword 
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao processar senha." });
  }
};

module.exports = { register };