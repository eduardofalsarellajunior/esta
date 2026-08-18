-- =============================================================================
-- 0030_bonus_faixas.sql — faixas de bonificação por pontos acumulados
--
-- Item 4: escada de descontos por pontos de fidelidade (qte_pontos em
-- `clientes`, já existente) — ex.: 1000 pontos = R$50 de desconto, 2000 =
-- R$110. Mantida pelo cliente do Eduardo (dono do lava-rápido), não pelo
-- Eduardo — por isso é um cadastro na tela, não algo fixo no código.
-- Reaproveita movimentos.bonus_fidelidade (já existia no schema, herdado do
-- legado — BONUSFIDE — mas nunca tinha sido preenchido por nenhuma tela).
-- =============================================================================

create table bonus_faixas (
  id                 uuid primary key default gen_random_uuid(),
  filial_id          uuid not null references filiais (id),
  pontos_necessarios numeric not null,
  valor_desconto     numeric not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table bonus_faixas is
  'Faixas de bônus por pontos de fidelidade acumulados (clientes.qte_pontos) — ao atingir pontos_necessarios, o operador pode oferecer valor_desconto na saída, consumindo os pontos da faixa.';

create trigger bonus_faixas_set_updated_at before update on bonus_faixas
  for each row execute function set_updated_at();

-- RLS — mesmo padrão de servicos/convenios: qualquer usuário autenticado da
-- filial (a trava de "só supervisor pra cima" é de tela, ver src/lib/acesso.js).
alter table bonus_faixas enable row level security;
create policy bonus_faixas_tenant_select on bonus_faixas for select to authenticated
  using (filial_id = filial_do_usuario());
create policy bonus_faixas_tenant_insert on bonus_faixas for insert to authenticated
  with check (filial_id = filial_do_usuario());
create policy bonus_faixas_tenant_update on bonus_faixas for update to authenticated
  using (filial_id = filial_do_usuario()) with check (filial_id = filial_do_usuario());
create policy bonus_faixas_tenant_delete on bonus_faixas for delete to authenticated
  using (filial_id = filial_do_usuario());
