// Dedup/normalização de Encontros (lógica pura, sem banco).
// Garante que um match com evento aceito NUNCA gera cards duplicados.
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolverOutroParticipante, mesclarEncontros } = require('../../src/utils/eventos');

test('resolverOutroParticipante: criador vê o convidado', () => {
  const ev = { created_by: 'U1', other_user_id: 'U2' };
  assert.equal(resolverOutroParticipante(ev, 'U1'), 'U2');
});

test('resolverOutroParticipante: convidado vê o criador (nunca a si mesmo)', () => {
  const ev = { created_by: 'U1', other_user_id: 'U2' };
  assert.equal(resolverOutroParticipante(ev, 'U2'), 'U1');
});

test('mesclarEncontros: o agendado SUBSTITUI o match "A combinar" do mesmo par', () => {
  const matches = [
    { id: 'match-1', otherUserId: 'REGIS', tipo: 'match' },
    { id: 'match-2', otherUserId: 'PERIGO', tipo: 'match' },
  ];
  const agendados = [
    { id: 'sched-9', otherUserId: 'REGIS', tipo: 'agendado' },
  ];
  const lista = mesclarEncontros(matches, agendados);
  assert.equal(lista.length, 2, 'cada pessoa aparece uma única vez');
  const regis = lista.filter((e) => e.otherUserId === 'REGIS');
  assert.equal(regis.length, 1, 'não duplica o par com evento aceito');
  assert.equal(regis[0].tipo, 'agendado', 'o agendado vence o match');
  assert.ok(lista.some((e) => e.otherUserId === 'PERIGO' && e.tipo === 'match'));
});

test('mesclarEncontros: dois agendados do mesmo par colapsam em um (o último vence)', () => {
  const agendados = [
    { id: 'sched-1', otherUserId: 'ANA', tipo: 'agendado', titulo: 'antigo' },
    { id: 'sched-2', otherUserId: 'ANA', tipo: 'agendado', titulo: 'novo' },
  ];
  const lista = mesclarEncontros([], agendados);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].titulo, 'novo');
});

test('mesclarEncontros: sem otherUserId cai no id (não quebra)', () => {
  const lista = mesclarEncontros([{ id: 'match-x', tipo: 'match' }], []);
  assert.equal(lista.length, 1);
});
