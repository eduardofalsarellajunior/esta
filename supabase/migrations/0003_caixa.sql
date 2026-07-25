-- =============================================================================
-- 0003_caixa.sql — Fase 3: turno de caixa (abertura/sangria/fechamento)
-- Aplicar após 0001/0002. Inclui RLS por filial.
-- =============================================================================

create table caixas (
  id             uuid primary key default gen_random_uuid(),
  filial_id      uuid not null references filiais (id),
  operador_id    uuid references perfis (id),
  aberto_em      timestamptz not null default now(),
  fechado_em     timestamptz,
  valor_abertura numeric(10,2) not null default 0,   -- troco inicial
  valor_fechamento numeric(10,2),                    -- dinheiro contado no fechamento
  status         text not null default 'aberto' check (status in ('aberto','fechado')),
  obs            text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table caixas is 'Turno de caixa por operador (ex-restric do legado).';
-- No máximo um caixa aberto por operador/filial.
create unique index caixas_aberto_idx on caixas (filial_id, operador_id) where status = 'aberto';

create table sangrias (
  id          uuid primary key default gen_random_uuid(),
  filial_id   uuid not null references filiais (id),
  caixa_id    uuid not null references caixas (id) on delete cascade,
  valor       numeric(10,2) not null,
  motivo      text,
  operador_id uuid references perfis (id),
  created_at  timestamptz not null default now()
);
comment on table sangrias is 'Retiradas de dinheiro do caixa durante o turno.';

-- Liga movimentos ao caixa do turno (preenchido na saída/cobrança).
alter table movimentos add column if not exists caixa_id uuid references caixas (id);
create index if not exists movimentos_caixa_idx on movimentos (caixa_id);

create trigger caixas_set_updated_at before update on caixas
  for each row execute function set_updated_at();

-- RLS
alter table caixas enable row level security;
alter table sangrias enable row level security;
do $$
declare t text;
begin
  foreach t in array array['caixas','sangrias'] loop
    execute format('create policy %I_sel on %I for select to authenticated using (filial_id = filial_do_usuario())', t, t);
    execute format('create policy %I_ins on %I for insert to authenticated with check (filial_id = filial_do_usuario())', t, t);
    execute format('create policy %I_upd on %I for update to authenticated using (filial_id = filial_do_usuario()) with check (filial_id = filial_do_usuario())', t, t);
    execute format('create policy %I_del on %I for delete to authenticated using (filial_id = filial_do_usuario())', t, t);
  end loop;
end $$;
