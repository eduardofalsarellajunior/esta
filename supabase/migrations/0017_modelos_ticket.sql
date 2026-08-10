-- =============================================================================
-- 0017_modelos_ticket.sql — layout dos comprovantes por filial
-- Traz pro esta o mecanismo do sistema legado (Harbour): o ticket é um texto
-- com tokens entre arrobas (`@CC@` = placa, `@V@` = valor), o que permite cada
-- filial ter seu próprio layout sem mexer em código. O motor que interpreta
-- está em src/lib/modeloTicket.js.
--
-- Sem modelo cadastrado, o app usa o layout fixo de antes (fallback) — dá pra
-- adotar aos poucos, um tipo de cada vez.
-- =============================================================================

create table modelos_ticket (
  id            uuid primary key default gen_random_uuid(),
  filial_id     uuid not null references filiais (id),
  tipo          text not null check (tipo in ('entrada', 'saida', 'segunda_via', 'mensalidade', 'rps')),
  conteudo      text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (filial_id, tipo)
);
comment on table modelos_ticket is 'Layout do comprovante por filial e tipo, em texto com tokens @X@ (ver src/lib/modeloTicket.js).';
comment on column modelos_ticket.tipo is 'entrada, saida, segunda_via (cliente perdeu o ticket), mensalidade, rps.';

create trigger modelos_ticket_set_updated_at before update on modelos_ticket
  for each row execute function set_updated_at();

-- RLS: mesmo padrão das demais tabelas por filial (0002_rls.sql).
alter table modelos_ticket enable row level security;
create policy modelos_ticket_tenant_select on modelos_ticket for select to authenticated
  using (filial_id = filial_do_usuario());
create policy modelos_ticket_tenant_insert on modelos_ticket for insert to authenticated
  with check (filial_id = filial_do_usuario());
create policy modelos_ticket_tenant_update on modelos_ticket for update to authenticated
  using (filial_id = filial_do_usuario()) with check (filial_id = filial_do_usuario());
create policy modelos_ticket_tenant_delete on modelos_ticket for delete to authenticated
  using (filial_id = filial_do_usuario());
