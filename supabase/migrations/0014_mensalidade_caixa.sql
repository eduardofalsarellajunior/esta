-- =============================================================================
-- 0014_mensalidade_caixa.sql — recebimento de mensalidade entra no caixa
-- Liga o evento de recebimento (0013) ao turno de caixa do operador, do mesmo
-- jeito que `movimentos.caixa_id`. O fechamento passa a somar as mensalidades
-- recebidas no turno (e o dinheiro delas no "esperado no caixa").
-- Aplicar depois de 0013_mensalidade_recebimento.sql.
-- =============================================================================

alter table mensalista_pagamentos
  add column caixa_id uuid references caixas (id);

comment on column mensalista_pagamentos.caixa_id is
  'Turno de caixa em que a mensalidade foi recebida (null = recebida sem caixa aberto).';

create index mensalista_pagtos_caixa_idx on mensalista_pagamentos (caixa_id);
