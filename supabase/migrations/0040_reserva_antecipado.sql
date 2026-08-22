-- =============================================================================
-- 0040_reserva_antecipado.sql — valor antecipado ao criar uma reserva,
-- mesmo espírito do 0039 (entrada do Pátio): conta como pagamento
-- recebido na hora, ligado ao caixa daquele momento.
--
-- Diferente de movimentos: reserva ainda não tem um movimento pra pendurar
-- em movimento_pagamentos (o carro pode nem ter chegado ainda), então o
-- pagamento fica direto na própria linha da reserva — reserva só tem um
-- antecipado por vez, não precisa de tabela própria pra isso.
--
-- Quando o carro da reserva entra (Patio.jsx, detectarReserva), esse valor
-- é somado em movimentos.valor_antecipado pra descontar na saída — SEM
-- criar um novo registro de pagamento (o dinheiro já foi contado aqui, no
-- caixa de quando a reserva foi feita; contar de novo duplicaria).
-- =============================================================================

alter table reservas add column valor_antecipado numeric(10,2);
alter table reservas add column forma_antecipado text;
alter table reservas add column caixa_id_antecipado uuid references caixas (id);
comment on column reservas.valor_antecipado is
  'Valor pago antecipado ao criar a reserva. Somado em movimentos.valor_antecipado quando o carro entra (ver Patio.jsx) — descontado do total na saída. NULL/0 = sem antecipado.';
comment on column reservas.caixa_id_antecipado is
  'Caixa que recebeu o antecipado no momento da reserva (pode ser bem antes da entrada do carro) — ver Caixa.jsx: soma junto com os antecipados feitos na entrada, sem duplicar.';
