const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../models');

// Função para cadastrar usuário REAL no banco
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

   // 1. Erro 400: Validação de campos (Critério do Gerente)
    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ 
        error: "Dados inválidos. Nome, e-mail e senha (mín. 6 caracteres) são obrigatórios." 
      });
    }

    // 2. Erro 409: Verificar se o e-mail já existe (Critério do Gerente)
    const userExists = await db.User.findOne({ where: { email } });
    if (userExists) {
      return res.status(409).json({ error: "Este e-mail já está cadastrado." });
    }

    // 3. Criptografia
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Criar o usuário
    const newUser = await db.User.create({
      name,
      email,
      password_hash: hashedPassword
    });

    // 5. LOGIN AUTOMÁTICO (Opção 1 solicitada pelo Gerente)
    // Geramos o token imediatamente após o cadastro
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    // 6. Resposta completa para o Front-end
    return res.status(201).json({
      message: "Usuário cadastrado com sucesso!",
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email
      },
      token // O Front usa isso para logar o usuário na hora
    });

  } catch (error) {
    console.error('Erro no cadastro:', error);
    return res.status(500).json({ error: "Erro interno ao processar cadastro." });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Buscar usuário pelo email
    const user = await db.User.findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({ message: "E-mail ou senha incorretos." });
    }

    // Verifica se o usuário foi banido antes de validar a senha
    if (user.is_banned) {
      return res.status(403).json({ 
        message: "Acesso negado. Sua conta foi banida por violação das nossas diretrizes." 
      });
    }
    
    // 2. Comparar a senha digitada com o hash do banco
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "E-mail ou senha incorretos." });
    }

    // 3. Se tudo estiver OK, gerar o Token JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, is_admin: user.is_admin }, // Payload (incluindo is_admin para facilitar no front)
      process.env.JWT_SECRET,             // Chave secreta
      { expiresIn: process.env.JWT_EXPIRES_IN } // Tempo de validade
    );

    // 4. Retornar os dados básicos + Token
    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_admin: user.is_admin // Retornar também se é admin
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

const uploadPhoto = async (req, res) => {
  try {
    const imageUrl = req.file.path; // URL vinda do Cloudinary que já testamos

    // Como você está logado como Aistides, o ID vem do token
    const userId = req.user.id; 

    // Atualiza o banco de dados PostgreSQL do projeto
    await db.User.update(
      { foto_url: imageUrl }, 
      { where: { id: userId } }
    );

    res.json({
      message: "Foto de perfil atualizada com sucesso!",
      url: imageUrl
    });
  } catch (error) {
    console.error("Erro no upload:", error);
    res.status(500).json({ error: "Erro ao salvar a foto no perfil." });
  }
};

const obterPerfil = async (req, res) => {
  try {
    const userId = req.user.id; // ID vindo do middleware de autenticação

    // Busca os dados no PostgreSQL excluindo a senha
    const user = await db.User.findByPk(userId, {
      attributes: { exclude: ['password_hash'] }
    });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    return res.status(200).json(user);

  } catch (error) {
    console.error("Erro na T024:", error);
    return res.status(500).json({ error: "Erro interno ao obter dados do perfil." });
  }
};

const atualizarPerfil = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, birth_date, bio, status_relacionamento, modo_discreto } = req.body;

    // 1. Filtrar apenas campos permitidos (White-list)
    const camposParaAtualizar = {};
    if (name !== undefined) camposParaAtualizar.name = name;
    if (birth_date !== undefined) camposParaAtualizar.birth_date = birth_date;
    if (bio !== undefined) camposParaAtualizar.bio = bio;
    if (status_relacionamento !== undefined) camposParaAtualizar.status_relacionamento = status_relacionamento;
    if (modo_discreto !== undefined) camposParaAtualizar.modo_discreto = modo_discreto;

    // 2. Verificar se há algo para atualizar
    if (Object.keys(camposParaAtualizar).length === 0) {
      return res.status(400).json({ error: "Nenhum campo válido enviado para atualização." });
    }

    // 3. Executar atualização no Sequelize
    const [updated] = await db.User.update(camposParaAtualizar, {
      where: { id: userId }
    });

    if (!updated) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    // 4. Buscar e retornar os dados atualizados (exceto senha)
    const userAtualizado = await db.User.findByPk(userId, {
      attributes: { exclude: ['password_hash'] }
    });

    return res.status(200).json({
      message: "Perfil atualizado com sucesso!",
      user: userAtualizado
    });

  } catch (error) {
    console.error("Erro na T025:", error);
    return res.status(500).json({ error: "Erro interno ao atualizar perfil." });
  }
};

const buscarPerfis = async (req, res) => {
  try {

    const { Op } = db.Sequelize;
    const userId = req.user.id;
    // Pega os parâmetros da URL (Query Params) com valores padrão
    const { 
      page = 1, 
      limit = 10, 
      idade_min, 
      idade_max, 
      status 
    } = req.query;
    
    const offset = (page - 1) * limit;

    // 1. Buscar IDs que o usuário logado já interagiu (Like ou Pass)
    const interagidos = await db.Interaction.findAll({
      where: { from_user_id: userId },
      attributes: ['to_user_id']
    });

    // Criamos uma lista de IDs para esconder da busca
    const idsParaExcluir = interagidos.map(i => i.to_user_id);
    idsParaExcluir.push(userId); // Adiciona o próprio ID para não se ver na busca

    // 2. Montar o filtro (Where Clause)
    let whereClause = {
      id: { [Op.notIn]: idsParaExcluir },
      modo_discreto: false // Critério da Task: ocultar perfis discretos
    };

    // Filtros opcionais de query
    if (status) {
      whereClause.status_relacionamento = status;
    }
    
   // 2. FILTROS AVANÇADO
     // Lógica de idade: calcula a data limite baseada no ano atual
    if (idade_min || idade_max) {
      const hoje = new Date();
      whereClause.data_nascimento = {};

      if (idade_min) {
        // Ex: 18 anos -> nascidos antes de hoje em (ano_atual - 18)
        const dataMinima = new Date(hoje.getFullYear() - idade_min, hoje.getMonth(), hoje.getDate());
        whereClause.data_nascimento[Op.lte] = dataMinima;
      }

      if (idade_max) {
        // Ex: 30 anos -> nascidos depois de hoje em (ano_atual - 31)
        const dataMaxima = new Date(hoje.getFullYear() - idade_max - 1, hoje.getMonth(), hoje.getDate());
        whereClause.data_nascimento[Op.gte] = dataMaxima;
      }
    }

    // Suporte a múltipla seleção de status (se vier como array ou string única)
    if (status) {
      whereClause.status_relacionamento = { 
        [Op.in]: Array.isArray(status) ? status : [status] 
      };
    }

    // Filtro de Interesses/Tags (usando operador overlap do Postgres para arrays)
    if (req.query.interesses) {
      const tags = Array.isArray(req.query.interesses) ? req.query.interesses : [req.query.interesses];
      whereClause.interesses = { [Op.overlap]: tags };
    }

    // 3. Busca paginada no PostgreSQL
    let { count, rows: perfis } = await db.User.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      attributes: ['id', 'name', 'idade', 'status_relacionamento', 'foto_url', 'bio'],
      order: [['createdAt', 'DESC']]
    });

    let fallback_aplicado = false;
    const THRESHOLD_MINIMO = 5; // Critério definido na Task T039

    // 4. Lógica de Fallback: Expandir filtros se houver poucos resultados
    if (count < THRESHOLD_MINIMO) {
      console.log(`[LOG] Fallback acionado. Resultados insuficientes: ${count}`);
      fallback_aplicado = true;

      // Expansão gradativa: Removemos o filtro de status para tentar encontrar mais perfis
      delete whereClause.status_relacionamento;

      // Segunda tentativa com filtros relaxados
      const buscaFallback = await db.User.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        attributes: ['id', 'name', 'idade', 'status_relacionamento', 'foto_url', 'bio'],
        order: [['createdAt', 'DESC']]
      });

      perfis = buscaFallback.rows;
      count = buscaFallback.count;
    }

    return res.status(200).json({
      total_resultados: count,
      total_paginas: Math.ceil(count / limit),
      pagina_atual: parseInt(page),
      fallback_aplicado, // Indicação exigida nos critérios de aceite
      perfis
    });

  } catch (error) {
    console.error("Erro na busca T039:", error);
    return res.status(500).json({ error: "Erro interno ao buscar perfis." });
  }
};

module.exports = { register, login, forgotPassword, resetPassword, uploadPhoto, buscarPerfis, obterPerfil, atualizarPerfil };