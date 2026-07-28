-- =============================================================================
-- 0010_servicos.sql — cadastro de Serviços (ex.: lavagem, polimento)
-- Código + descrição + tabela de preço usada pra cobrar (referencia o `tipo`
-- de tabelas_preco, validado na tela via seleção — mesmo padrão do "Tabela
-- alt." em Convênios).
-- =============================================================================

create table servicos (
  id            uuid primary key default gen_random_uuid(),
  filial_id     uuid not null references filiais (id),
  codigo        text not null,
  descricao     text not null,
  tabela_tipo   text not null,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (filial_id, codigo)
);
comment on table servicos is 'Catálogo de serviços e a tabela de preço usada para cobrar cada um.';

create trigger servicos_set_updated_at before update on servicos
  for each row execute function set_updated_at();

-- RLS
alter table servicos enable row level security;
create policy servicos_tenant_select on servicos for select to authenticated
  using (filial_id = filial_do_usuario());
create policy servicos_tenant_insert on servicos for insert to authenticated
  with check (filial_id = filial_do_usuario());
create policy servicos_tenant_update on servicos for update to authenticated
  using (filial_id = filial_do_usuario()) with check (filial_id = filial_do_usuario());
create policy servicos_tenant_delete on servicos for delete to authenticated
  using (filial_id = filial_do_usuario());
