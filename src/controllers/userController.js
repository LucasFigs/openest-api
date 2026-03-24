const crypto = require('crypto');
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

// CONTROLLER DO POSTGRESQL

const forgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        // 1. Verifica se o usuário existe usando o Sequelize (Query pura)
        const [userCheck] = await db.sequelize.query(
            'SELECT id FROM "Users" WHERE email = $1',
            { 
                bind: [email], 
                type: db.sequelize.QueryTypes.SELECT 
            }
        );
        
        // Se o resultado for vazio, avisamos o usuário (por segurança, sem confirmar se o e-mail existe)
        if (!userCheck) {
            return res.json({ message: "Se este e-mail estiver cadastrado, um link de recuperação foi enviado." });
        }

        // 2. Gera um token aleatório e data de expiração (1 hora)
        const token = crypto.randomBytes(20).toString('hex');
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);

        // 3. Salva na tabela password_resets usando bind para proteção contra SQL Injection
        await db.sequelize.query(
            'INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, $3)',
            { 
                bind: [email, token, expiresAt] 
            }
        );

        // 4. Mock do envio de e-mail (Logamos no console por enquanto)
        console.log(`--- ENVIO DE E-MAIL (MOCK) ---`);
        console.log(`Para: ${email}`);
        console.log(`Link: http://localhost:3000/reset-password?token=${token}`);
        console.log(`------------------------------`);

        res.json({ message: "Se este e-mail estiver cadastrado, um link de recuperação foi enviado." });

    } catch (error) {
        console.error("Erro no forgotPassword:", error);
        res.status(500).json({ error: "Erro interno no servidor." });
    }
};

const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;

    try {
        // 1. Busca o token no banco e verifica expiração
        const [resetRequest] = await db.sequelize.query(
            'SELECT email, expires_at FROM password_resets WHERE token = $1',
            { bind: [token], type: db.sequelize.QueryTypes.SELECT }
        );

        if (!resetRequest || new Date() > new Date(resetRequest.expires_at)) {
            return res.status(400).json({ error: "Token inválido ou expirado." });
        }

        // 2. Gera o Hash da nova senha
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // 3. Atualiza a senha na tabela "Users"
        await db.sequelize.query(
            'UPDATE "Users" SET password_hash = $1 WHERE email = $2',
            { bind: [hashedPassword, resetRequest.email] }
        );

        // 4. Deleta o token para não ser usado de novo
        await db.sequelize.query(
            'DELETE FROM password_resets WHERE token = $1',
            { bind: [token] }
        );

        res.json({ message: "Senha atualizada com sucesso! Agora você já pode logar." });

    } catch (error) {
        console.error("Erro no resetPassword:", error);
        res.status(500).json({ error: "Erro interno ao redefinir senha." });
    }
};

module.exports = { register, login, forgotPassword, resetPassword };