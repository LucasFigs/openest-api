const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
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
// Função para login de usuário
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Buscar usuário pelo email
    const user = await db.User.findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({ message: "E-mail ou senha incorretos." });
    }

    // 2. Comparar a senha digitada com o hash do banco
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "E-mail ou senha incorretos." });
    }

    // 3. Se tudo estiver OK, gerar o Token JWT
    const token = jwt.sign(
      { id: user.id, email: user.email }, // Payload (o que vai dentro do token)
      process.env.JWT_SECRET,             // Chave secreta
      { expiresIn: process.env.JWT_EXPIRES_IN } // Tempo de validade
    );

    // 4. Retornar os dados básicos + Token
    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      token
    });

  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({ message: "Erro interno ao realizar login." });
  }
};

module.exports = { register, login };  