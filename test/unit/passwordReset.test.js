// Validação da senha nova em POST /api/users/reset-password.
// Os casos inválidos respondem 400 ANTES de qualquer consulta ao banco.
const test = require('node:test');
const assert = require('node:assert/strict');

const userController = require('../../src/controllers/userController');

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('reset-password recusa senha nova com menos de 6 caracteres', async () => {
  const res = fakeRes();
  await userController.resetPassword({ body: { token: 'abc123', newPassword: '12345' } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /6 caracteres/);
});

test('reset-password recusa pedido sem token', async () => {
  const res = fakeRes();
  await userController.resetPassword({ body: { newPassword: 'senhaforte' } }, res);
  assert.equal(res.statusCode, 400);
});

test('reset-password recusa senha que não é texto', async () => {
  const res = fakeRes();
  await userController.resetPassword({ body: { token: 'abc123', newPassword: 12345678 } }, res);
  assert.equal(res.statusCode, 400);
});

test('reset-password recusa corpo vazio sem quebrar', async () => {
  const res = fakeRes();
  await userController.resetPassword({}, res);
  assert.equal(res.statusCode, 400);
});
