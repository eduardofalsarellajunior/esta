-- =============================================================================
-- 0041_reserva_valor_proposto.sql — valor proposto calculado na hora da
-- reserva, a partir da tabela de preço indicada pelo PREFIXO do código das
-- vagas daquele tipo (ver src/lib/reservas.js: prefixoTabela/mapaTabelaPorTipo
-- e cadastros.jsx, onde o prefixo do lote de vagas passa a valer também como
-- código da tabela de preço).
--
-- É só uma ESTIMATIVA impressa no ticket da reserva (dias reservados x tarifa
-- da tabela, mesmo motor de packages/tarifacao usado na cobrança real) — não é
-- cobrança: quem cobra de verdade é a saída real do veículo (Patio.jsx), que
-- pode dar valor diferente (hora exata de chegada, convênio, serviços...).
-- Gravado no momento da reserva (não recalculado depois) pra não virar um
-- valor "móvel" se a tabela de preço mudar antes do carro chegar.
-- =============================================================================

alter table reservas add column valor_proposto numeric(10,2);
comment on column reservas.valor_proposto is
  'Estimativa calculada na hora da reserva (tabela de preço = prefixo do código das vagas do tipo, ver reservas.js) — dias reservados x tarifa da tabela. Não é cobrança real. NULL = não deu pra calcular (tipo sem tabela correspondente, ou faixa "pede valor" na saída).';
