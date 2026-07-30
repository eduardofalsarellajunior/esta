-- =============================================================================
-- 0013_mensalidade_recebimento.sql — valor da mensalidade, data do próximo
-- pagamento e recebimento no cadastro do mensalista.
--
-- O cadastro passa a guardar quanto o mensalista paga (`valor_mensalidade`) e
-- quando é o próximo pagamento (`proximo_pagamento`). O botão "Receber" da tela
-- de Mensalistas grava um evento em `mensalista_pagamentos` (data, valor, forma
-- de pagamento e a nova data do próximo pagamento — mesmo dia do mês seguinte),
-- atualiza `mensalistas.proximo_pagamento` e imprime o comprovante. O evento é
-- o que alimenta o BI/Painel.
-- =============================================================================

alter table mensalistas
  add column valor_mensalidade numeric(10,2) not null default 0,
  add column proximo_pagamento date;

comment on column mensalistas.valor_mensalidade is
  'Valor da mensalidade cobrada deste mensalista (sugerido no recebimento).';
comment on column mensalistas.proximo_pagamento is
  'Data do próximo pagamento. Cada recebimento avança um mês (mesmo dia).';

create table mensalista_pagamentos (
  id                 uuid primary key default gen_random_uuid(),
  filial_id          uuid not null references filiais (id),   -- denormalizado p/ RLS
  mensalista_id      uuid not null references mensalistas (id) on delete cascade,
  dt_pagamento       date not null default current_date,
  valor_pago         numeric(10,2) not null,
  forma_pagamento    text not null,          -- codigo de formas_pagamento
  proximo_pagamento  date not null,          -- nova data gravada no cadastro
  proximo_anterior   date,                   -- data que estava no cadastro (auditoria)
  observacao         text,
  recebido_por       uuid references perfis (id),
  created_at         timestamptz not null default now()
);
comment on table mensalista_pagamentos is
  'Recebimentos de mensalidade (evento por pagamento). Base do comprovante e do BI/Painel.';
create index mensalista_pagtos_mens_idx on mensalista_pagamentos (mensalista_id, dt_pagamento desc);
create index mensalista_pagtos_filial_idx on mensalista_pagamentos (filial_id, dt_pagamento);

-- RLS: mesmo isolamento por filial das outras tabelas.
alter table mensalista_pagamentos enable row level security;
create policy mensalista_pagamentos_tenant_select on mensalista_pagamentos for select to authenticated
  using (filial_id = filial_do_usuario());
create policy mensalista_pagamentos_tenant_insert on mensalista_pagamentos for insert to authenticated
  with check (filial_id = filial_do_usuario());
create policy mensalista_pagamentos_tenant_update on mensalista_pagamentos for update to authenticated
  using (filial_id = filial_do_usuario()) with check (filial_id = filial_do_usuario());
create policy mensalista_pagamentos_tenant_delete on mensalista_pagamentos for delete to authenticated
  using (filial_id = filial_do_usuario());
