const { Interaction, Match } = require('../models');

const curtirPerfil = async (req, res) => {
  const from_user_id = req.user.id; // ID de quem está logado (via token)
  const to_user_id = req.params.usuarioId; // ID de quem está sendo curtido

  try {
    // 1. Validar se não está curtindo a si mesmo
    if (from_user_id === to_user_id) {
      return res.status(400).json({ message: "Você não pode curtir a si mesmo." });
    }

    // 2. Validar se já não curtiu antes
    const jaCurtiu = await Interaction.findOne({
      where: { from_user_id, to_user_id, type: 'like' }
    });

    if (jaCurtiu) {
      return res.status(400).json({ message: "Você já curtiu este perfil." });
    }

    // 3. Registrar a interação na tabela Interactions
    await Interaction.create({
      from_user_id,
      to_user_id,
      type: 'like'
    });

    // 4. ENGINE DE MATCH: Verificar se o outro usuário já curtiu este
    const matchReverso = await Interaction.findOne({
      where: {
        from_user_id: to_user_id,
        to_user_id: from_user_id,
        type: 'like'
      }
    });

    if (matchReverso) {
      // Registrar na tabela de Matches
      // Usamos uma lógica simples de ID menor primeiro para evitar duplicidade na lógica
      const [user1, user2] = from_user_id < to_user_id 
        ? [from_user_id, to_user_id] 
        : [to_user_id, from_user_id];

      await Match.findOrCreate({
        where: { user1_id: user1, user2_id: user2 }
      });

      return res.status(201).json({ 
        message: "Interação registrada!", 
        match: true 
      });
    }

    return res.status(201).json({ 
      message: "Interação registrada!", 
      match: false 
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao processar curtida." });
  }
};

module.exports = { curtirPerfil };