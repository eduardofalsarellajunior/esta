-- =============================================================================
-- 0004_financeiro.sql — Fase 5: contas a receber/pagar + banco/caixa
-- Reescrita limpa (sem a heranca escolar do legado). Inclui RLS.
-- Aplicar após 0001/0002.
-- =============================================================================

create table fornecedores (
  id         uuid primary key default gen_random_uuid(),
  filial_id  uuid not null references filiais (id),
  nome       text not null,
  cnpj_cpf   text,
  telefone   text,
  email      text,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contas_bancarias (
  id            uuid primary key default gen_random_uuid(),
  filial_id     uuid not null references filiais (id),
  nome          text not null,
  banco         text,
  agencia       text,
  conta         text,
  saldo_inicial numeric(12,2) not null default 0,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table titulos_receber (
  id            uuid primary key default gen_random_uuid(),
  filial_id     uuid not null references filiais (id),
  descricao     text not null,
  cliente_nome  text,
  mensalista_id uuid references mensalistas (id),
  convenio_id   uuid references convenios (id),
  origem        text not null default 'manual'
                check (origem in ('mensalidade','convenio','avulso','manual')),
  valor         numeric(12,2) not null,
  vencimento    date not null,
  pago          boolean not null default false,
  dt_pagamento  date,
  valor_pago    numeric(12,2),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table titulos_receber is 'Contas a receber. Ponte automatica: mensalidade/convenio -> titulo.';
create index titulos_receber_venc_idx on titulos_receber (filial_id, vencimento, pago);

create table titulos_pagar (
  id            uuid primary key default gen_random_uuid(),
  filial_id     uuid not null references filiais (id),
  fornecedor_id uuid references fornecedores (id),
  descricao     text not null,
  valor         numeric(12,2) not null,
  vencimento    date not null,
  pago          boolean not null default false,
  dt_pagamento  date,
  valor_pago    numeric(12,2),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index titulos_pagar_venc_idx on titulos_pagar (filial_id, vencimento, pago);

create table lancamentos_banco (
  id           uuid primary key default gen_random_uuid(),
  filial_id    uuid not null references filiais (id),
  conta_id     uuid not null references contas_bancarias (id) on delete cascade,
  data         date not null default current_date,
  historico    text not null,
  valor        numeric(12,2) not null,          -- positivo=crédito, negativo=débito
  conciliado   boolean not null default false,
  centro_custo text,
  created_at   timestamptz not null default now()
);
create index lancamentos_banco_idx on lancamentos_banco (conta_id, data);

-- Gatilhos updated_at
do $$
declare t text;
begin
  foreach t in array array['fornecedores','contas_bancarias','titulos_receber','titulos_pagar'] loop
    execute format('create trigger %I_set_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- RLS
do $$
declare t text;
begin
  foreach t in array array['fornecedores','contas_bancarias','titulos_receber','titulos_pagar','lancamentos_banco'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_sel on %I for select to authenticated using (filial_id = filial_do_usuario())', t, t);
    execute format('create policy %I_ins on %I for insert to authenticated with check (filial_id = filial_do_usuario())', t, t);
    execute format('create policy %I_upd on %I for update to authenticated using (filial_id = filial_do_usuario()) with check (filial_id = filial_do_usuario())', t, t);
    execute format('create policy %I_del on %I for delete to authenticated using (filial_id = filial_do_usuario())', t, t);
  end loop;
end $$;
