-- =============================================================================
-- 0023_print_jobs.sql — pedido de impressão do celular pra impressora da cabine
--
-- O celular não tem o truque de impressão silenciosa da cabine (kiosk-printing
-- é uma flag do Chrome desktop, não existe em navegador mobile). Em vez de
-- construir um agente/ponte nova, o celular só grava o pedido aqui; o próprio
-- navegador da cabine (já aberto, já logado — ver docs/CABINE.md) fica de olho
-- nessa tabela e chama a MESMA função de impressão que já usa hoje
-- (imprimirTicket em src/componentes/Ticket.jsx). Ver Layout.jsx.
--
-- `ticket` guarda exatamente o objeto que TicketModal/imprimirTicket já
-- consomem ({titulo, linhas, modelo, dados}) — nenhuma transformação nova.
-- =============================================================================

create table print_jobs (
  id          uuid primary key default gen_random_uuid(),
  filial_id   uuid not null references filiais (id),
  ticket      jsonb not null,
  status      text not null default 'pendente' check (status in ('pendente', 'impresso', 'erro')),
  erro        text,
  criado_por  uuid references perfis (id),
  criado_em   timestamptz not null default now(),
  impresso_em timestamptz
);
comment on table print_jobs is 'Pedido de impressão do celular pra impressora fixa da cabine — o navegador da cabine (ver Layout.jsx) escuta e chama imprimirTicket().';
create index print_jobs_pendentes_idx on print_jobs (filial_id, status) where status = 'pendente';

alter table print_jobs enable row level security;
create policy print_jobs_tenant_select on print_jobs for select to authenticated
  using (filial_id = filial_do_usuario());
create policy print_jobs_tenant_insert on print_jobs for insert to authenticated
  with check (filial_id = filial_do_usuario());
create policy print_jobs_tenant_update on print_jobs for update to authenticated
  using (filial_id = filial_do_usuario()) with check (filial_id = filial_do_usuario());
create policy print_jobs_tenant_delete on print_jobs for delete to authenticated
  using (filial_id = filial_do_usuario());
