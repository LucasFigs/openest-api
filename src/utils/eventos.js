// Lógica PURA (sem banco) de montagem da lista de Encontros.
// Mantida fora do controller para poder ser testada isoladamente.

// Resolve o ID do OUTRO participante de um encontro agendado, nunca o do
// próprio usuário logado. Quem criou o convite vê o convidado; o convidado
// vê o criador.
function resolverOutroParticipante(ev, userId) {
  const created = ev?.created_by;
  const other = ev?.other_user_id;
  return String(created) === String(userId) ? other : created;
}

// Deduplica por par de usuários: cada pessoa aparece UMA única vez.
// Um encontro AGENDADO substitui o card "A combinar" (match) do mesmo par.
// Entre dois agendados do mesmo par, vence o último da lista (a query já vem
// ordenada por scheduled_at ASC, então o mais recente sobrescreve).
// Cada item deve ter `otherUserId` (chave) e `tipo` ('match' | 'agendado').
function mesclarEncontros(eventosDeMatch = [], eventosAgendados = []) {
  const porPar = new Map();
  for (const ev of eventosDeMatch) {
    porPar.set(ev.otherUserId || ev.id, ev);
  }
  for (const ev of eventosAgendados) {
    porPar.set(ev.otherUserId || ev.id, ev);
  }
  return Array.from(porPar.values());
}

module.exports = { resolverOutroParticipante, mesclarEncontros };
