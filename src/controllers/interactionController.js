const { Interaction, Match } = require('../models');

// Função auxiliar para verificar se houve um match
const checkMatch = async (userA, userB) => {
  // Verifica se o Usuário B já curtiu o Usuário A
  const interactionBack = await Interaction.findOne({
    where: {
      from_user_id: userB,
      to_user_id: userA,
      type: 'like'
    }
  });

  if (interactionBack) {
    // Se sim, cria o registro na tabela Matches
    const newMatch = await Match.create({
      user1_id: userA,
      user2_id: userB
    });

    // TODO: Disparar notificação (Task futura ou log por enquanto)
    console.log(`🔥 MATCH REAL: ${userA} & ${userB}`);
    
    return newMatch;
  }

  return null;
};

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

    const matchResult = await checkMatch(from_user_id, to_user_id);

    return res.status(201).json({
        message: "Interação registrada!",
        match: !!matchResult,
        data: matchResult
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao processar curtida." });
  }
};

const passarPerfil = async (req, res) => {
  const from_user_id = req.user.id;
  const to_user_id = req.params.usuarioId;

  try {
    // 1. Validar se não está passando em si mesmo
    if (from_user_id === to_user_id) {
      return res.status(400).json({ message: "Você não pode passar a si mesmo." });
    }

    // 2. Registrar a interação do tipo 'pass'
    await Interaction.create({
      from_user_id,
      to_user_id,
      type: 'pass'
    });

    return res.status(201).json({ 
      message: "Interação registrada (pass)!", 
      match: false 
    });

  } catch (error) {
    console.error("Erro na T035:", error);
    return res.status(500).json({ error: "Erro ao processar 'passar'." });
  }
};

module.exports = { curtirPerfil, passarPerfil };
