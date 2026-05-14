const { sequelize } = require('../models'); 

const getMonitoramento = async (req, res) => {
  try {
    // 1. Calcular Uptime do Servidor
    const uptimeSeconds = process.uptime();
    const formatUptime = (seconds) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      return `${h}h ${m}m ${s}s`;
    };

    // 2. Medir Latência e Status do Banco
    const startDbTime = Date.now();
    let dbStatus = 'offline';
    
    try {
      await sequelize.authenticate(); // Ping no banco de dados
      dbStatus = 'online';
    } catch (error) {
      dbStatus = 'offline';
    }
    
    const dbLatency = Date.now() - startDbTime;

    // 3. Montar a resposta final exigida pela Task
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

module.exports = { getMonitoramento };