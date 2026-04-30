const { Report, User } = require('../models');
const { Op } = require('sequelize');

exports.createReport = async (req, res) => {
  try {
    const { reported_id, reason, description } = req.body;
    const reporter_id = req.user.id; // ID do usuário logado vindo do middleware auth

    // 1. Validar que não está denunciando a si mesmo
    if (reporter_id === parseInt(reported_id)) {
      return res.status(400).json({ error: "Você não pode denunciar o seu próprio perfil." });
    }

    // 2. Validar que não é uma denúncia duplicada (ainda pendente)
    const existingReport = await Report.findOne({
      where: {
        reporter_id,
        reported_id,
        status: 'pending'
      }
    });

    if (existingReport) {
      return res.status(400).json({ error: "Você já possui uma denúncia pendente para este usuário." });
    }

    // 3. Salvar denúncia com status 'pending'
    const report = await Report.create({
      reporter_id,
      reported_id,
      reason,
      description,
      status: 'pending'
    });

    // 4. Retornar resposta (Garantindo anonimato: não enviamos dados do denunciante)
    return res.status(201).json({
      message: "Denúncia enviada com sucesso. Nossa equipe irá analisar em breve.",
      report_id: report.id
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.listReports = async (req, res) => {
  try {
    const { status, reported_id, date, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Construção dinâmica dos filtros
    const whereClause = {};
    if (status) whereClause.status = status;
    if (reported_id) whereClause.reported_id = reported_id;
    if (date) {
      whereClause.created_at = { [Op.gte]: new Date(date) };
    }

    const { count, rows } = await Report.findAndCountAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'ReportedUser', // O alias que definimos no model Report
        attributes: ['id', 'name', 'foto_url', 'email']
      }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    return res.status(200).json({
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      reports: rows
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Ação: Banir Usuário
exports.banUser = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await Report.findByPk(id);

    if (!report) return res.status(404).json({ error: "Denúncia não encontrada." });

    // Marca o usuário como banido
    await User.update({ is_banned: true }, { where: { id: report.reported_id } });

    // Atualiza a denúncia
    await report.update({
      status: 'banned',
      reviewed_by: req.user.id,
      reviewed_at: new Date()
    });

    return res.json({ message: "Usuário banido e denúncia encerrada." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Ação: Ignorar Denúncia
exports.dismissReport = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await Report.findByPk(id);

    await report.update({
      status: 'dismissed',
      reviewed_by: req.user.id,
      reviewed_at: new Date()
    });

    return res.json({ message: "Denúncia ignorada." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};