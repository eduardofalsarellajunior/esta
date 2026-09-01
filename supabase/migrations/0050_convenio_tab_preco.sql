-- =============================================================================
-- 0050_convenio_tab_preco.sql — tabela que cobra o tempo DEPOIS do convênio
--
-- Fecha a regra do "pede hora" (`convenios.pede_hora`, que existia no cadastro
-- desde 0001 mas nunca era perguntada na saída): quando o convênio pede hora,
-- o operador informa o horário em que o cliente saiu do convênio (vem
-- carimbado no ticket). O convênio banca até ali; do corte até a saída é
-- estadia normal, do bolso do cliente, cobrada por ESTA tabela.
--
-- Caso real: cliente vai ao cabeleireiro (convênio paga 100%), fica 1h15 e
-- depois passeia 2h pela cidade. O convênio paga a 1h15; o cliente paga as 2h.
-- Sem isso, o desconto do convênio cobria o passeio também.
--
-- Ver packages/tarifacao/tarifacao.ts (`Convenio.tabPreco`, `doisSegmentos`).
-- =============================================================================

alter table convenios add column tab_preco text;
comment on column convenios.tab_preco is
  'Tabela de preço (tipo) que cobra o tempo depois que o cliente saiu do convênio, quando há hora de corte (pede_hora). NULL = cobra pela tabela do próprio veículo.';
