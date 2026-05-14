const { sequelize } = require('./src/models');

async function seed() {
  try {
    console.log("🚀 Forçando dados de teste para a Task #62...");

    const userId = '6dbbd069-9f17-4670-9b80-46acae43dea8';
    
    // 1. Criar a Conversa com um ID manual e Match ID manual (inteiros)
    console.log("📂 Criando conversa fake...");
    await sequelize.query(`
      INSERT INTO conversations (id, match_id, created_at, updated_at) 
      VALUES (1, 1, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `);
    
    const conversationId = 1;
    console.log(`✅ Conversa ${conversationId} pronta.`);

    // 2. Criar 35 Mensagens vinculadas a essa conversa ID 1
    console.log("📝 Gerando 35 mensagens para testar o scroll...");
    
    // Vamos deletar mensagens antigas do teste para não duplicar
    await sequelize.query(`DELETE FROM messages WHERE conversation_id = ${conversationId}`);

    for (let i = 1; i <= 35; i++) {
      await sequelize.query(`
        INSERT INTO messages (content, conversation_id, sender_id, created_at) 
        VALUES ('Mensagem de teste ${i}', ${conversationId}, '${userId}', NOW());
      `);
    }

    console.log("✅ 35 mensagens inseridas com sucesso!");
    console.log("\n🔥 AGORA VOCÊ CONSEGUE TESTAR:");
    console.log(`URL: GET http://localhost:3000/conversas/${conversationId}/mensagens?page=1&limit=20`);

    process.exit();
  } catch (error) {
    console.error("❌ Erro:", error.message);
    process.exit(1);
  }
}

seed();