const { Report } = require('../models');

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