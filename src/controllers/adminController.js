const { Op } = require('sequelize');
const db = require('../models'); 

// Isso vai imprimir no seu terminal os nomes EXATOS das suas tabelas!
console.log("🛠️ MODELOS DISPONÍVEIS NO SEU BANCO:", Object.keys(db));

const sequelize = db.sequelize;
const User = db.User || db.user;
const Match = db.Match || db.match;

// Tentamos os nomes em inglês e em português. Se não achar, fica null (mas não quebra)
const Report = db.Report || db.report || db.Denuncia || db.denuncia || null;
const Message = db.Message || db.message || db.Mensagem || db.mensagem || null;
const Interaction = db.Interaction || db.interaction || db.Interacao || db.interacao || null;

const getMonitoramento = async (req, res) => {
  try {
    const uptimeSeconds = process.uptime();
    const formatUptime = (seconds) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      return `${h}h ${m}m ${s}s`;
    };

    const startDbTime = Date.now();
    let dbStatus = 'offline';
    
    try {
      await sequelize.authenticate();
      dbStatus = 'online';
    } catch (error) {
      dbStatus = 'offline';
    }
    
    const dbLatency = Date.now() - startDbTime;

    return res.status(200).json({
      api_status: 'online',
      db_status: dbStatus,
      latencia_media: `${dbLatency}ms`,
      uptime: formatUptime(uptimeSeconds),
    });

  } catch (error) {
    console.error("Erro no endpoint de monitoramento:", error);
    return res.status(500).json({ error: 'Erro interno ao processar as métricas.' });
  }
};

const getKpiUsuarios = async (req, res) => {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const umaSemanaAtras = new Date();
    umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);

    const total = await User.count();
    const novosHoje = await User.count({ where: { createdAt: { [Op.gte]: hoje } } });
    const novosSemana = await User.count({ where: { createdAt: { [Op.gte]: umaSemanaAtras } } });

    return res.status(200).json({ total, novos_hoje: novosHoje, novos_semana: novosSemana });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao carregar métricas de usuários" });
  }
};

const getKpiMatches = async (req, res) => {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const total = await Match.count();
    const matchesHoje = await Match.count({ where: { createdAt: { [Op.gte]: hoje } } });

    return res.status(200).json({ total, matches_hoje: matchesHoje });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao carregar métricas de matches" });
  }
};

// Se não achar o modelo, retorna zero pacificamente.
const getKpiDenuncias = async (req, res) => {
  try {
    if (!Report) {
      console.warn("⚠️ Modelo de Denúncias não encontrado. Retornando 0.");
      return res.status(200).json({ total: 0, por_status: [] });
    }

    const total = await Report.count();
    const porStatus = await Report.findAll({
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'quantidade']],
      group: ['status']
    });

    return res.status(200).json({ total, por_status: porStatus });
  } catch (error) {
    console.error("Erro KPI Denuncias:", error);
    return res.status(500).json({ error: "Erro ao carregar métricas de denúncias" });
  }
};

// Se não achar o modelo, retorna zero pacificamente.
const getKpiEngajamento = async (req, res) => {
  try {
    if (!Message || !Interaction) {
      console.warn("⚠️ Modelos de Engajamento não encontrados. Retornando 0.");
      return res.status(200).json({ mensagens_enviadas: 0, curtidas: 0 });
    }

    const mensagensEnviadas = await Message.count();
    const curtidas = await Interaction.count({ where: { type: 'like' } }); 

    return res.status(200).json({ mensagens_enviadas: mensagensEnviadas, curtidas });
  } catch (error) {
    console.error("Erro KPI Engajamento:", error);
    return res.status(500).json({ error: "Erro ao carregar métricas de engajamento" });
  }
};

module.exports = { 
  getMonitoramento, 
  getKpiUsuarios, 
  getKpiMatches, 
  getKpiDenuncias, 
  getKpiEngajamento 
};