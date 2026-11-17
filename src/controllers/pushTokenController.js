// T048 — Registro do Expo Push Token do aparelho do usuário logado.
const { PushToken } = require('../models');
const { isExpoPushToken } = require('../services/pushService');

// POST /api/users/push-token  { token, platform }
// Idempotente: o mesmo aparelho pode chamar a cada login. Se o token já
// pertencia a outra conta (troca de usuário no mesmo celular), ele é
// transferido para a conta atual — assim a conta antiga para de receber.
exports.register = async (req, res) => {
  try {
    const { token, platform } = req.body || {};
    if (!isExpoPushToken(token)) {
      return res.status(400).json({ error: 'Expo Push Token inválido.' });
    }

    const existing = await PushToken.findOne({ where: { token } });
    if (existing) {
      await existing.update({ user_id: req.user.id, platform: platform || existing.platform });
    } else {
      await PushToken.create({ token, user_id: req.user.id, platform: platform || null });
    }

    return res.status(200).json({ message: 'Push token registrado.' });
  } catch (error) {
    console.error('Erro ao registrar push token:', error);
    return res.status(500).json({ error: 'Erro ao registrar push token.' });
  }
};

// DELETE /api/users/push-token  { token }
// Chamado no logout ou quando o usuário desativa as notificações.
exports.unregister = async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ error: 'Informe o token a ser removido.' });
    }
    await PushToken.destroy({ where: { token, user_id: req.user.id } });
    return res.status(200).json({ message: 'Push token removido.' });
  } catch (error) {
    console.error('Erro ao remover push token:', error);
    return res.status(500).json({ error: 'Erro ao remover push token.' });
  }
};
