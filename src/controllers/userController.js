const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../models');

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ error: "Dados inválidos. Nome, e-mail e senha (mín. 6 caracteres) são obrigatórios." });
    }
    const userExists = await db.User.findOne({ where: { email } });
    if (userExists) return res.status(409).json({ error: "Este e-mail já está cadastrado." });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUser = await db.User.create({ name, email, password_hash: hashedPassword });

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    return res.status(201).json({
      message: "Usuário cadastrado com sucesso!",
      user: { id: newUser.id, name: newUser.name, email: newUser.email },
      token
    });
  } catch (error) {
    console.error('Erro no cadastro:', error);
    return res.status(500).json({ error: "Erro interno ao processar cadastro." });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ message: "E-mail ou senha incorretos." });
    if (user.is_banned) return res.status(403).json({ message: "Acesso negado. Sua conta foi banida por violação das nossas diretrizes." });

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) return res.status(401).json({ message: "E-mail ou senha incorretos." });

    const token = jwt.sign(
      { id: user.id, email: user.email, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      user: { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin },
      token
    });
  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({ message: "Erro interno ao realizar login." });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const [userCheck] = await db.sequelize.query(
      'SELECT id FROM "Users" WHERE email = $1',
      { bind: [email], type: db.sequelize.QueryTypes.SELECT }
    );
    if (!userCheck) return res.json({ message: "Se este e-mail estiver cadastrado, um link de recuperação foi enviado." });

    const token = crypto.randomBytes(20).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await db.sequelize.query(
      'INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, $3)',
      { bind: [email, token, expiresAt] }
    );

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
    const [resetRequest] = await db.sequelize.query(
      'SELECT email, expires_at FROM password_resets WHERE token = $1',
      { bind: [token], type: db.sequelize.QueryTypes.SELECT }
    );
    if (!resetRequest || new Date() > new Date(resetRequest.expires_at)) {
      return res.status(400).json({ error: "Token inválido ou expirado." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await db.sequelize.query('UPDATE "Users" SET password_hash = $1 WHERE email = $2', { bind: [hashedPassword, resetRequest.email] });
    await db.sequelize.query('DELETE FROM password_resets WHERE token = $1', { bind: [token] });

    res.json({ message: "Senha atualizada com sucesso! Agora você já pode logar." });
  } catch (error) {
    console.error("Erro no resetPassword:", error);
    res.status(500).json({ error: "Erro interno ao redefinir senha." });
  }
};

const uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhuma imagem enviada." });
    }

    const imageUrl = req.file.path || req.file.secure_url;

    if (!imageUrl) {
      return res.status(500).json({ error: "Cloudinary não retornou a URL da imagem." });
    }

    const userId = req.user.id;

    await db.User.update(
      { foto_url: imageUrl },
      { where: { id: userId } }
    );

    return res.status(200).json({
      message: "Foto de perfil atualizada com sucesso!",
      url: imageUrl
    });
  } catch (error) {
    console.error("Erro no upload:", error);
    return res.status(500).json({ error: "Erro ao salvar a foto no perfil." });
  }
};

const obterPerfil = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await db.User.findByPk(userId, {
      attributes: { exclude: ['password_hash'] }
    });
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
    return res.status(200).json(user);
  } catch (error) {
    console.error("Erro na T024:", error);
    return res.status(500).json({ error: "Erro interno ao obter dados do perfil." });
  }
};

const atualizarPerfil = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 🔥 AGORA INCLUÍMOS O foto_url NA DESESTRUTURAÇÃO
    const { name, birth_date, bio, status_relacionamento, modo_discreto, foto_url } = req.body;

    const camposParaAtualizar = {};
    if (name !== undefined) camposParaAtualizar.name = name;
    
    if (birth_date !== undefined) {
      if (birth_date && birth_date !== 'Invalid date' && birth_date !== 'Invalid Date' && String(birth_date).trim() !== '') {
        camposParaAtualizar.birth_date = birth_date;
      }
    }

    if (bio !== undefined) camposParaAtualizar.bio = bio;
    if (status_relacionamento !== undefined) camposParaAtualizar.status_relacionamento = status_relacionamento;
    if (modo_discreto !== undefined) camposParaAtualizar.modo_discreto = modo_discreto;
    
    // 🔥 PERMITE ATUALIZAR (OU APAGAR) A FOTO DE PERFIL
    if (foto_url !== undefined) camposParaAtualizar.foto_url = foto_url;

    if (Object.keys(camposParaAtualizar).length === 0) {
      return res.status(400).json({ error: "Nenhum campo válido enviado para atualização." });
    }

    const [updated] = await db.User.update(camposParaAtualizar, { where: { id: userId } });
    if (!updated) return res.status(404).json({ error: "Usuário não encontrado." });

    const userAtualizado = await db.User.findByPk(userId, {
      attributes: { exclude: ['password_hash'] }
    });

    return res.status(200).json({ message: "Perfil atualizado com sucesso!", user: userAtualizado });
  } catch (error) {
    console.error("Erro na T025:", error);
    return res.status(500).json({ error: "Erro interno ao atualizar perfil." });
  }
};

const buscarPerfis = async (req, res) => {
  try {
    const { Op } = db.Sequelize;
    const userId = req.user.id;

    const { page = 1, limit = 10, idade_min, idade_max, status } = req.query;
    const offset = (page - 1) * limit;

    const interagidos = await db.Interaction.findAll({
      where: { from_user_id: userId },
      attributes: ['to_user_id']
    });
    const idsParaExcluir = interagidos.map(i => i.to_user_id);
    idsParaExcluir.push(userId);

    let whereClause = {
      id: { [Op.notIn]: idsParaExcluir },
      modo_discreto: false
    };

    if (idade_min || idade_max) {
      const hoje = new Date();
      whereClause.birth_date = {};

      if (idade_min) {
        const dataLimiteMax = new Date(hoje.getFullYear() - parseInt(idade_min), hoje.getMonth(), hoje.getDate());
        whereClause.birth_date[Op.lte] = dataLimiteMax;
      }

      if (idade_max) {
        const dataLimiteMin = new Date(hoje.getFullYear() - parseInt(idade_max) - 1, hoje.getMonth(), hoje.getDate());
        whereClause.birth_date[Op.gte] = dataLimiteMin;
      }
    }

    if (status) {
      whereClause.status_relacionamento = {
        [Op.in]: Array.isArray(status) ? status : [status]
      };
    }

    if (req.query.interesses) {
      const tags = Array.isArray(req.query.interesses) ? req.query.interesses : [req.query.interesses];
      whereClause.interesses = { [Op.overlap]: tags };
    }

    const fetchPerfis = async (where) => db.User.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      attributes: ['id', 'name', 'birth_date', 'status_relacionamento', 'foto_url', 'bio'],
      order: [['created_at', 'DESC']]
    });

    let { count, rows: perfis } = await fetchPerfis(whereClause);

    let fallback_aplicado = false;
    const THRESHOLD_MINIMO = 5;

    if (count < THRESHOLD_MINIMO) {
      console.log(`[LOG] Fallback acionado. Resultados: ${count}`);
      fallback_aplicado = true;
      const whereFallback = { ...whereClause };
      delete whereFallback.status_relacionamento;
      delete whereFallback.birth_date;
      delete whereFallback.interesses;

      const fallback = await fetchPerfis(whereFallback);
      perfis = fallback.rows;
      count  = fallback.count;
    }

    const perfisFormatados = perfis.map(u => {
      const dados = u.toJSON();
      let idade = null;
      if (dados.birth_date) {
        const nascimento = new Date(dados.birth_date);
        const hoje = new Date();
        idade = hoje.getFullYear() - nascimento.getFullYear();
        const mesPassou = hoje.getMonth() > nascimento.getMonth() ||
          (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() >= nascimento.getDate());
        if (!mesPassou) idade--;
      }
      return { ...dados, idade, birth_date: undefined };
    });

    return res.status(200).json({
      total_resultados: count,
      total_paginas: Math.ceil(count / limit),
      pagina_atual: parseInt(page),
      hasMore: parseInt(page) < Math.ceil(count / limit),
      fallback_aplicado,
      perfis: perfisFormatados
    });

  } catch (error) {
    console.error("Erro na busca T039:", error);
    return res.status(500).json({ error: "Erro interno ao buscar perfis." });
  }
};

const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await db.User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const emailAnonimizado = `excluido_${Date.now()}_${userId}@openest.com`;
    await user.update({
      name: 'Usuário Excluído',
      email: emailAnonimizado,
      foto_url: null,
      bio: null,
      password_hash: 'deleted',
      status_relacionamento: 'individual'
    });
    await user.destroy();

    return res.status(200).json({ message: 'Sua conta foi excluída e seus dados anonimizados com sucesso.' });
  } catch (error) {
    console.error("Erro ao excluir conta (LGPD):", error);
    return res.status(500).json({ error: 'Erro interno ao processar a exclusão da conta.' });
  }
};

const exportUserData = async (req, res) => {
  try {
    const userId = req.user.id;
    const { Op } = db.Sequelize;

    const user = await db.User.findByPk(userId, {
      attributes: { exclude: ['password_hash', 'deleted_at'] }
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const Match       = db.Match || db.match || null;
    const Message     = db.Message || db.message || null;
    const Interaction = db.Interaction || db.interaction || null;

    const matches      = Match       ? await Match.findAll({ where: { [Op.or]: [{ user1_id: userId }, { user2_id: userId }] } }).catch(() => []) : [];
    const messages     = Message     ? await Message.findAll({ where: { [Op.or]: [{ sender_id: userId }, { receiver_id: userId }] } }).catch(() => []) : [];
    const interactions = Interaction ? await Interaction.findAll({ where: { [Op.or]: [{ from_user_id: userId }, { to_user_id: userId }] } }).catch(() => []) : [];

    const exportData = { perfil: user, matches, mensagens: messages, interacoes: interactions, exportado_em: new Date() };

    res.setHeader('Content-Disposition', `attachment; filename=dados_openest_${userId}.json`);
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    console.error("Erro ao exportar dados (LGPD):", error);
    return res.status(500).json({ error: 'Erro interno ao processar a exportação.' });
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  uploadPhoto,
  buscarPerfis,
  obterPerfil,
  atualizarPerfil,
  deleteAccount,
  exportUserData
};