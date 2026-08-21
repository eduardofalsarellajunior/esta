-- =============================================================================
-- 0039_valor_antecipado.sql — valor pago antecipado na entrada, descontado
-- do total na saída.
--
-- Conta como pagamento recebido na hora (não só um desconto silencioso):
-- movimento_pagamentos ganha um caixa_id PRÓPRIO, preenchido só pra esse
-- caso (pagamento normal de saída continua null, ligado via
-- movimentos.caixa_id como sempre foi) — pra o dinheiro entrar no
-- fechamento do caixa que de fato recebeu, mesmo que o carro ainda esteja
-- no pátio quando aquele turno fechar. Ver src/telas/Patio.jsx (entrada e
-- calcularResultadoSaida) e src/telas/Caixa.jsx (fechamento).
-- =============================================================================

alter table movimentos add column valor_antecipado numeric(10,2);
comment on column movimentos.valor_antecipado is
  'Valor pago antecipado na entrada (ver movimento_pagamentos.caixa_id pro registro do pagamento em si) — descontado do total calculado na saída, piso em zero. NULL/0 = sem antecipado.';

alter table movimento_pagamentos add column caixa_id uuid references caixas (id);
comment on column movimento_pagamentos.caixa_id is
  'Só preenchido pra pagamento de valor antecipado (feito na ENTRADA, ligado ao caixa daquele momento) — pagamento normal da saída continua null (a ligação com o caixa nesse caso já vem de movimentos.caixa_id). Ver Caixa.jsx: evita contar o mesmo dinheiro em dois fechamentos.';
