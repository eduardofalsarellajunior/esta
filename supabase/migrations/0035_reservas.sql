-- =============================================================================
-- 0035_reservas.sql — reserva de vaga por tipo (ex.: coberta/descoberta,
-- texto livre igual vagas.tipo) e intervalo de dias.
--
-- Ver src/lib/reservas.js e src/telas/Reservas.jsx. Caso de uso original:
-- estacionamento perto de aeroporto, vagas coberta/descoberta, reserva de
-- vários dias corridos (hoje feita por telefone + planilha). Também serve
-- pro caso de reserva por período (manhã/tarde/noite) de um dia só, que um
-- outro cliente do Eduardo já usa hoje (antes via valores mágicos de hora
-- no ESTALANC do legado — aqui vira uma tabela própria, sem essa gambiarra).
--
-- Mensalistas e avulsos NÃO entram na conta de capacidade — só reservas
-- confirmadas (confirmado com o Eduardo).
-- =============================================================================

create table reservas (
  id            uuid primary key default gen_random_uuid(),
  filial_id     uuid not null references filiais (id),
  tipo          text not null,           -- mesmo texto livre de vagas.tipo
  periodo       text not null default 'dia_todo'
                check (periodo in ('dia_todo', 'manha', 'tarde', 'noite')),
  data_inicio   date not null,
  data_fim      date not null check (data_fim >= data_inicio),
  nome          text,
  telefone      text,
  placa         text,
  observacao    text,
  status        text not null default 'confirmada'
                check (status in ('confirmada', 'cancelada', 'no_show', 'concluida')),
  criado_por    uuid references perfis (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index reservas_periodo_idx on reservas (filial_id, tipo, data_inicio, data_fim) where status = 'confirmada';
comment on table reservas is
  'Reserva de vaga por tipo (coberta/descoberta, texto livre igual vagas.tipo) e intervalo de dias. Mensalistas e avulsos não entram na conta de capacidade — só reservas confirmadas. Ver src/lib/reservas.js.';

create trigger reservas_set_updated_at before update on reservas
  for each row execute function set_updated_at();

alter table reservas enable row level security;
create policy reservas_tenant_select on reservas for select to authenticated
  using (filial_id = filial_do_usuario());
create policy reservas_tenant_insert on reservas for insert to authenticated
  with check (filial_id = filial_do_usuario());
create policy reservas_tenant_update on reservas for update to authenticated
  using (filial_id = filial_do_usuario()) with check (filial_id = filial_do_usuario());
create policy reservas_tenant_delete on reservas for delete to authenticated
  using (filial_id = filial_do_usuario());
