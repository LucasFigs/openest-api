const bcrypt = require('bcrypt');
const db = require('../models');

// Função para cadastrar usuário REAL no banco
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validação simples de campos
    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ 
        error: "Dados inválidos. Nome, e-mail e senha (mín. 6 caracteres) são obrigatórios." 
      });
    }

    // Verificar se o e-mail já existe
    const userExists = await db.User.findOne({ where: { email } });
    if (userExists) {
      return res.status(409).json({ error: "Este e-mail já está cadastrado." });
    }

    // Gerar o "salt" e o Hash
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Criar o usuário no banco de dados (Task T014 + T015)
    const newUser = await db.User.create({
      name,
      email,
      password_hash: hashedPassword // Nome da coluna que definida na Migration
    });

    // 5. Preparar resposta (Removendo a senha por segurança)
    const userResponse = newUser.toJSON();
    delete userResponse.password_hash;

    return res.status(201).json({
      message: "Usuário cadastrado com sucesso!",
      user: userResponse
    });

  } catch (error) {
    console.error('Erro no cadastro:', error);
    return res.status(500).json({ error: "Erro interno ao processar cadastro." });
  }
};

module.exports = { register };