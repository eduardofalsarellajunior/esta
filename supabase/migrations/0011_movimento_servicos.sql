-- =============================================================================
-- 0011_movimento_servicos.sql — serviços marcados num veículo (M:N)
-- Enquanto o veículo está no pátio, o operador marca quais serviços foram
-- usados (tela de Entrada, botão "Serviço"). Na saída, se houver algum
-- marcado, o valor cobrado vira a SOMA da tabela de preço de cada serviço,
-- em vez da tabela do modelo do veículo (ver packages/tarifacao).
-- =============================================================================

create table movimento_servicos (
  id            uuid primary key default gen_random_uuid(),
  filial_id     uuid not null references filiais (id),  -- denormalizado p/ RLS
  movimento_id  uuid not null references movimentos (id) on delete cascade,
  servico_id    uuid not null references servicos (id),
  created_at    timestamptz not null default now(),
  unique (movimento_id, servico_id)
);
comment on table movimento_servicos is 'Serviços marcados num movimento (checkbox na Entrada) — soma as tabelas na saída.';
create index movimento_servicos_mov_idx on movimento_servicos (movimento_id);

-- RLS
alter table movimento_servicos enable row level security;
create policy movimento_servicos_tenant_select on movimento_servicos for select to authenticated
  using (filial_id = filial_do_usuario());
create policy movimento_servicos_tenant_insert on movimento_servicos for insert to authenticated
  with check (filial_id = filial_do_usuario());
create policy movimento_servicos_tenant_delete on movimento_servicos for delete to authenticated
  using (filial_id = filial_do_usuario());
