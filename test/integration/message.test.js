const request = require('supertest');
const app = require('../../src/app');
const { Message } = require('../../src/models');

describe('Message Pagination API', () => {
  beforeAll(async () => {
    // Criar mensagens de teste no banco local
    await Message.bulkCreate([
      { conversation_id: 1, content: 'Mensagem 1', user_id: 1 },
      { conversation_id: 1, content: 'Mensagem 2', user_id: 2 },
      { conversation_id: 1, content: 'Mensagem 3', user_id: 1 },
    ]);
  });

  it('deve retornar a primeira página com limite de 2 mensagens', async () => {
    const res = await request(app)
      .get('/conversas/1/mensagens?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`); // Se houver auth

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.pagination).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 2,
        hasNext: true
      })
    );
  });
});