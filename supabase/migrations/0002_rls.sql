-- =============================================================================
-- esta — 0002_rls.sql
-- Row-Level Security: isolamento multi-tenant por filial.
-- Aplicar DEPOIS de 0001_core_schema.sql.
--
-- Regra: cada usuário só enxerga/edita dados da SUA filial (perfis.filial_id).
-- O service_role (usado em scripts admin/carga) ignora RLS automaticamente.
-- =============================================================================

-- Função auxiliar: filial do usuário logado.
-- SECURITY DEFINER para ler `perfis` sem recair na própria RLS (evita recursão).
create or replace function filial_do_usuario()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select filial_id from perfis where id = auth.uid();
$$;
comment on function filial_do_usuario is 'Retorna a filial do usuário autenticado (base da RLS).';

-- Função auxiliar: usuário é supervisor?
create or replace function usuario_eh_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select papel = 'supervisor' from perfis where id = auth.uid()),
    false);
$$;

-- -----------------------------------------------------------------------------
-- filiais: o usuário só vê a própria filial. Alteração só por supervisor.
-- -----------------------------------------------------------------------------
alter table filiais enable row level security;

create policy filiais_select on filiais for select to authenticated
  using (id = filial_do_usuario());

create policy filiais_update on filiais for update to authenticated
  using (id = filial_do_usuario() and usuario_eh_supervisor())
  with check (id = filial_do_usuario());
-- INSERT/DELETE de filiais fica a cargo do service_role (provisionamento SaaS).

-- -----------------------------------------------------------------------------
-- Tabelas com filial_id: isolamento uniforme por filial.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'perfis','formas_pagamento','tabelas_preco','tabela_preco_faixas',
    'modelos_veiculo','convenios','mensalistas','mensalista_veiculos',
    'mensalidades','vagas','clientes','movimentos','movimento_pagamentos'
  ] loop
    execute format('alter table %I enable row level security', t);
    -- Leitura: qualquer usuário da filial.
    execute format(
      'create policy %I_tenant_select on %I for select to authenticated
         using (filial_id = filial_do_usuario())', t, t);
    -- Escrita (insert/update/delete): dados da própria filial.
    execute format(
      'create policy %I_tenant_insert on %I for insert to authenticated
         with check (filial_id = filial_do_usuario())', t, t);
    execute format(
      'create policy %I_tenant_update on %I for update to authenticated
         using (filial_id = filial_do_usuario())
         with check (filial_id = filial_do_usuario())', t, t);
    execute format(
      'create policy %I_tenant_delete on %I for delete to authenticated
         using (filial_id = filial_do_usuario())', t, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Endurecimentos recomendados (ajustar conforme a operação):
--  • `movimentos` é log append-only: idealmente REVOGAR delete de operadores e
--    permitir apenas correções via update com auditoria. Deixado permissivo por
--    filial nesta fase; restringir quando o fluxo de cancelamento estiver pronto.
--  • Cadastros sensíveis (tabelas_preco, convenios, formas_pagamento) poderiam
--    exigir supervisor para escrita — basta trocar o WITH CHECK por
--    "... and usuario_eh_supervisor()". Mantido aberto por filial nesta fase.
-- -----------------------------------------------------------------------------

-- Fim de 0002.
