-- =============================================================================
-- 0022_restricao_mensalista.sql — dia/turno contratado pelo mensalista
--
-- Réplica de ESTALANC.PRG:520-563 (RESTRM/RESTRT/RESTRN + PERIODO1/2/3), já
-- presentes em `mensalistas` desde 0001 mas nunca usados pelo app. Sem
-- restrição configurada (campos nulos, caso de todo mensalista hoje), nada
-- muda — é o que preserva o comportamento atual.
--
-- `movimentos.livre_a_partir`: quando a entrada cai fora do dia/turno
-- contratado, guarda o horário (mesmo dia) em que o próximo turno contratado
-- começa. A saída cobra avulso só até lá — não a estadia inteira. Calculado
-- e gravado na entrada (é o único momento em que dá pra saber COM CERTEZA
-- que o motivo de virar avulso foi a restrição de horário, e não vencimento
-- ou vaga esgotada, que têm suas próprias regras).
-- =============================================================================

alter table movimentos add column livre_a_partir hora_comercial;
comment on column movimentos.livre_a_partir is
  'Mensalista/hóspede fora do dia/turno contratado na entrada: a partir deste horário (mesmo dia) a permanência já está dentro do contratado — cobra avulso só até aqui. Null = sem restrição de horário aplicável a este movimento.';
