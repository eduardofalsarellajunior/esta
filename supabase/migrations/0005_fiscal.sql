-- =============================================================================
-- 0005_fiscal.sql — Fase 4: RPS / NFS-e (Padrão Nacional)
-- Guarda o ciclo de vida do documento fiscal. Inclui RLS.
-- A GERAÇÃO do XML e o cálculo ficam na aplicação; a TRANSMISSÃO/assinatura
-- exige certificado digital (integração externa) — ver docs.
-- =============================================================================

create table notas_fiscais (
  id             uuid primary key default gen_random_uuid(),
  filial_id      uuid not null references filiais (id),
  movimento_id   uuid references movimentos (id),
  numero_rps     bigint,
  serie          text,
  numero_nfse    text,
  lote           text,
  competencia    date not null default current_date,
  tomador        jsonb not null default '{}'::jsonb,  -- cpf/cnpj, nome, endereço
  descricao      text,
  valor          numeric(12,2) not null default 0,
  aliquota_iss   numeric(6,4) not null default 0,
  valor_iss      numeric(12,2) not null default 0,
  status         text not null default 'pendente'
                 check (status in ('pendente','gerada','enviada','autorizada','erro','cancelada')),
  xml            text,
  retorno        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table notas_fiscais is 'RPS/NFS-e por movimento (Padrão Nacional). Transmissão externa via certificado.';
create index notas_fiscais_status_idx on notas_fiscais (filial_id, status, competencia);

-- Sequência de numeração de RPS por filial (substitui o contador global do legado).
create table fiscal_sequencias (
  filial_id  uuid not null references filiais (id),
  serie      text not null,
  proximo    bigint not null default 1,
  primary key (filial_id, serie)
);

create trigger notas_fiscais_set_updated_at before update on notas_fiscais
  for each row execute function set_updated_at();

-- RLS
do $$
declare t text;
begin
  foreach t in array array['notas_fiscais','fiscal_sequencias'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_sel on %I for select to authenticated using (filial_id = filial_do_usuario())', t, t);
    execute format('create policy %I_ins on %I for insert to authenticated with check (filial_id = filial_do_usuario())', t, t);
    execute format('create policy %I_upd on %I for update to authenticated using (filial_id = filial_do_usuario()) with check (filial_id = filial_do_usuario())', t, t);
    execute format('create policy %I_del on %I for delete to authenticated using (filial_id = filial_do_usuario())', t, t);
  end loop;
end $$;
