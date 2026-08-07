-- =============================================================================
-- 0016_movimento_valor_alterado.sql — valor cobrado alterado à mão na saída
-- O operador pode sobrescrever, na saída, o valor que o motor de tarifação
-- calculou (cortesia, negociação, erro de tabela...). Quando isso acontece,
-- `valor` passa a ser o valor efetivamente cobrado e `valor_calculado` guarda
-- o que o motor tinha proposto — null significa "não foi alterado".
--
-- Quem/quando já têm colunas próprias desde 0001 (usuario_altera/dt_altera),
-- preenchidas na mesma hora.
-- =============================================================================

alter table movimentos
  add column valor_calculado numeric;

comment on column movimentos.valor_calculado is
  'Valor proposto pelo motor de tarifação, quando o operador alterou o valor na saída. Null = valor não foi alterado (o cobrado é o calculado).';
