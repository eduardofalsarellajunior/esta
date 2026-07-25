-- =============================================================================
-- esta — 0001_core_schema.sql
-- Núcleo operacional multi-tenant do sistema de estacionamento.
-- Modelo derivado das estruturas reais do legado (ESTAHORA, ESTALANC, ESTACONV,
-- ESTAEMPR, ESTACAR, ESTAPGTO, ESTAAUTO), normalizado e preparado para SaaS.
--
-- Convenção de tempo: "hora comercial" HH.MM (14.30 = 14h30; a parte decimal
-- são MINUTOS, 00–59). Ver domínio `hora_comercial`. Mantém 1:1 com o motor
-- de tarifação (packages/tarifacao) e com o legado.
--
-- ⚠️ Fluxo Supabase manual: este SQL é para ser aplicado por você no SQL Editor.
--    Revise antes de executar. Não destrói dados (só cria objetos).
-- =============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- Domínio de hora comercial HH.MM (minuto 00–59). Serve p/ horários e durações.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'hora_comercial') then
    create domain hora_comercial as numeric(7,2)
      check (value >= 0 and (round((value - floor(value)) * 100))::int < 60);
  end if;
end $$;

-- Gatilho genérico de updated_at ---------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =============================================================================
-- 1. Multi-tenant: filiais e perfis
-- =============================================================================

create table filiais (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null,
  razao_social  text not null,
  nome_fantasia text,
  cnpj          text,
  inscricao_est text,
  inscricao_mun text,            -- p/ NFS-e (imrps)
  endereco      text,
  numero        text,
  complemento   text,
  bairro        text,
  cidade        text,
  uf            char(2),
  cep           text,
  cod_ibge      text,            -- município IBGE (NFS-e)
  fuso          text not null default 'America/Sao_Paulo',
  -- Parametrização operacional (herança do SIS2002: flags pededata, ctrlbox,
  -- delay de vaga, fidelidade etc.). Fica em JSONB, editável pelo supervisor.
  config        jsonb not null default '{}'::jsonb,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (codigo)
);
comment on table filiais is 'Filial/pátio. Multi-tenant: raiz do isolamento por RLS.';

-- perfis: 1 registro por usuário do Supabase Auth.
create table perfis (
  id         uuid primary key references auth.users (id) on delete cascade,
  filial_id  uuid not null references filiais (id),
  nome       text not null,
  papel      text not null default 'operador'
             check (papel in ('supervisor','operador')),
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table perfis is 'Perfil do usuário (liga auth.users à filial e ao papel).';
create index perfis_filial_idx on perfis (filial_id);

-- =============================================================================
-- 2. Formas de pagamento (ESTAPGTO)
-- =============================================================================

create table formas_pagamento (
  id           uuid primary key default gen_random_uuid(),
  filial_id    uuid not null references filiais (id),
  codigo       text not null,                 -- 2 chars no legado (ex.: 'D ')
  descricao    text not null,
  perc_ajuste  numeric(6,2) not null default 0,  -- PERCPGTO (acréscimo/desconto %)
  eh_dinheiro  boolean not null default false,   -- 'D' = dinheiro físico (caixa)
  rps_sempre   boolean not null default false,   -- RPSSEMPRE
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (filial_id, codigo)
);
comment on table formas_pagamento is 'Formas de pagamento (dinheiro/débito/crédito/Pix). Data-driven, como no legado.';

-- =============================================================================
-- 3. Tarifação: tabelas de preço + faixas (ESTAHORA, 45 colunas -> 1:N)
--    Com VIGÊNCIA para preservar histórico de preços (o legado não preservava).
-- =============================================================================

create table tabelas_preco (
  id              uuid primary key default gen_random_uuid(),
  filial_id       uuid not null references filiais (id),
  tipo            text not null,               -- código (ESTAHORA.TIPO: 'P','G'...)
  descricao       text not null,
  por_minuto      boolean not null default false,     -- PORMINUTO
  pernoite_ini    hora_comercial not null default 0,  -- EPERNOITE (0 = sem pernoite)
  pernoite_fim    hora_comercial not null default 0,  -- SPERNOITE
  valor_diaria    numeric(10,2) not null default 0,   -- VPERNOITE
  tolerancia_pct  numeric(5,2)  not null default 0,   -- TOL (percentual!)
  valor_antes     numeric(10,2) not null default 0,   -- VALORANTES
  qte_pontos      numeric(10,2) not null default 0,   -- QTEPONTOS (fidelidade)
  vigencia_inicio date not null default current_date,
  vigencia_fim    date,                        -- null = vigente
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table tabelas_preco is 'Tabela de preço por tipo de veículo, com vigência (histórico de preços).';
-- No máximo uma tabela vigente (sem fim) por tipo/filial.
create unique index tabelas_preco_vigente_idx
  on tabelas_preco (filial_id, tipo) where vigencia_fim is null and ativo;
create index tabelas_preco_tipo_idx on tabelas_preco (filial_id, tipo);

create table tabela_preco_faixas (
  id               uuid primary key default gen_random_uuid(),
  filial_id        uuid not null references filiais (id),   -- denormalizado p/ RLS
  tabela_preco_id  uuid not null references tabelas_preco (id) on delete cascade,
  ordem            int  not null,               -- 1..45
  ate              hora_comercial not null,     -- ATEnn (teto de tempo)
  valor_hora       numeric(10,2) not null,      -- HORnn
  valor_convenio   numeric(10,2) not null default 0,  -- CONnn
  unique (tabela_preco_id, ordem)
);
comment on table tabela_preco_faixas is 'Faixas de preço (normaliza ATE/HOR/CON do ESTAHORA).';
create index faixas_tabela_idx on tabela_preco_faixas (tabela_preco_id, ordem);

-- =============================================================================
-- 4. Modelos de veículo (ESTACAR: 598 registros)
-- =============================================================================

create table modelos_veiculo (
  id            uuid primary key default gen_random_uuid(),
  filial_id     uuid not null references filiais (id),
  codigo        text not null,       -- CODIGO
  nome          text not null,       -- CARRO
  tabela_tipo   text,                -- TABELA (tabela de preço padrão)
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (filial_id, codigo)
);
comment on table modelos_veiculo is 'Catálogo de modelos -> tabela de preço padrão (ESTACAR).';

-- =============================================================================
-- 5. Convênios (ESTACONV)
-- =============================================================================

create table convenios (
  id            uuid primary key default gen_random_uuid(),
  filial_id     uuid not null references filiais (id),
  codigo        text not null,          -- CODCONV
  tipo          char(1) not null default 'C',  -- 'C' convênio, 'V' vale
  razao         text not null,
  cnpj          text,
  inscricao     text,
  -- Regras de desconto (aplicadas em cascata no motor de tarifação):
  tab_conv      text,                   -- TABCONV (usa outra tabela de preço)
  tab_horas     boolean not null default false, -- TABHORAS (usa coluna CON)
  perc_conv     numeric(6,2) not null default 0, -- PERCONV (%)
  vlr_conv      numeric(10,2) not null default 0, -- VLRCONV (fixo)
  hor_conv      hora_comercial not null default 0, -- HORCONV
  pede_hora     boolean not null default false, -- PEDEHORA (hora de corte)
  pede_cc       boolean not null default false, -- PEDECC (centro de custo)
  -- Selos / vales:
  selos         int not null default 0,          -- saldo de selos
  valor_selo    numeric(10,2) not null default 0, -- VALORSELO
  so_supervisor boolean not null default false,  -- SOSUPER
  ativo         boolean not null default true,
  -- Campos avançados (descontos escalonados ATE/MENOS/PERC, dias) preservados:
  extras        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (filial_id, codigo)
);
comment on table convenios is 'Convênios e vales (ESTACONV). Regras de desconto consumidas pelo motor.';

-- =============================================================================
-- 6. Mensalistas (ESTAEMPR) — placas 1:N (remove limite legado de 3) + mensalidades
-- =============================================================================

create table mensalistas (
  id            uuid primary key default gen_random_uuid(),
  filial_id     uuid not null references filiais (id),
  codigo        text not null,          -- NOMECAR (chave legada)
  razao         text not null,
  tipo_mens     char(1) not null default 'I', -- TIPOMENS (I/P/H...)
  convenio_id   uuid references convenios (id),
  cpf_cnpj      text,
  telefone      text,
  celular       text,
  email         text,
  endereco      text,
  bairro        text,
  cidade        text,
  uf            char(2),
  cep           text,
  box           text,                   -- vaga reservada
  dia_venc      int,                    -- DIAVENC
  tolerancia_dias int not null default 0, -- TOLERANCIA (dias de carência)
  multa_pct     numeric(6,2) not null default 0,  -- MULTA
  juros_pct     numeric(8,4) not null default 0,  -- JUROS
  qte_vagas     int not null default 1,  -- QTEVAGAS (pool de vagas)
  -- Restrições de horário por turno (máscaras de 7 dias, S/N) e limites:
  restr_manha   char(7),                 -- RESTRM
  restr_tarde   char(7),                 -- RESTRT
  restr_noite   char(7),                 -- RESTRN
  periodo1      hora_comercial not null default 0, -- PERIODO1
  periodo2      hora_comercial not null default 0, -- PERIODO2
  periodo3      hora_comercial not null default 0, -- PERIODO3
  hora_extra    boolean not null default false,    -- HORAEXTRA
  ativo         boolean not null default true,     -- ATIVO
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (filial_id, codigo)
);
comment on table mensalistas is 'Mensalistas/hóspedes (ESTAEMPR). Placas em tabela filha 1:N.';

create table mensalista_veiculos (
  id            uuid primary key default gen_random_uuid(),
  filial_id     uuid not null references filiais (id),  -- denormalizado p/ RLS
  mensalista_id uuid not null references mensalistas (id) on delete cascade,
  placa         text not null,
  modelo        text,
  tipo_veic     text,
  created_at    timestamptz not null default now(),
  unique (filial_id, placa)          -- 1 mensalista ativo por placa/filial
);
comment on table mensalista_veiculos is 'Placas do mensalista (1:N, sem o limite legado de 3).';
create index mensalista_veic_idx on mensalista_veiculos (mensalista_id);

create table mensalidades (
  id            uuid primary key default gen_random_uuid(),
  filial_id     uuid not null references filiais (id),
  mensalista_id uuid not null references mensalistas (id) on delete cascade,
  competencia   date not null,          -- mês de referência (dia 1)
  valor         numeric(10,2) not null,
  vencimento    date not null,
  pago          boolean not null default false,
  dt_pagamento  date,
  valor_pago    numeric(10,2),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (mensalista_id, competencia)
);
comment on table mensalidades is 'Mensalidades (VLRMES/DIA/VALOR). Base da futura ponte com contas a receber.';
create index mensalidades_filial_idx on mensalidades (filial_id, vencimento);

-- =============================================================================
-- 7. Vagas / boxes (ESTABOX) — com delay de reuso
-- =============================================================================

create table vagas (
  id            uuid primary key default gen_random_uuid(),
  filial_id     uuid not null references filiais (id),
  codigo        text not null,          -- BOX
  tipo          text,
  ocupada       boolean not null default false,
  placa_atual   text,
  liberavel_em  timestamptz,            -- delay de re-utilização (wdelayvaga)
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (filial_id, codigo)
);
comment on table vagas is 'Vagas/boxes com delay de reuso (liberavel_em).';

-- =============================================================================
-- 8. Clientes / fidelidade (ESTAAUTO) — base do futuro app do cliente
-- =============================================================================

create table clientes (
  id            uuid primary key default gen_random_uuid(),
  filial_id     uuid not null references filiais (id),
  placa         text not null,
  nome          text,
  cpf_cnpj      text,
  telefone      text,
  email         text,
  endereco      text,
  qte_visitas   int not null default 0,      -- QTEVISITA
  qte_pontos    numeric(10,2) not null default 0, -- QTEPONTOS
  ult_visita    date,                        -- ULTVISITA
  aniversario   date,                        -- NIVER
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (filial_id, placa)
);
comment on table clientes is 'CRM/fidelidade por placa (ESTAAUTO). Base do app do cliente.';

-- =============================================================================
-- 9. Movimentos (ESTALANC) — log operacional append-only
-- =============================================================================

create table movimentos (
  id                uuid primary key default gen_random_uuid(),
  filial_id         uuid not null references filiais (id),
  placa             text not null,
  modelo            text,
  -- Tempo:
  dt_entrada        date not null,
  hr_entrada        hora_comercial not null,
  dt_saida          date,
  hr_saida          hora_comercial,
  -- Classificação:
  tipo_mens         char(1) not null default 'E',  -- E avulso, I/P mensalista, C convênio...
  tipo_veic         text not null,                 -- tabela de preço usada
  convenio_codigo   text,
  box               text,
  aviso             text,
  -- Valores (espelham o cálculo do motor de tarifação):
  valor_proporcional numeric(10,2) not null default 0, -- VALORPROP
  valor_convenio     numeric(10,2) not null default 0, -- VALORCONV
  valor_selos        numeric(10,2) not null default 0,
  valor_vales        numeric(10,2) not null default 0,
  bonus_fidelidade   numeric(10,2) not null default 0, -- BONUSFIDE
  valor_dev          numeric(10,2) not null default 0, -- VALORDEV (saldo devedor)
  valor              numeric(10,2) not null default 0, -- valor cobrado
  hora_convenio      hora_comercial,                   -- HORACONV (hora de corte)
  pontos_ganhos      numeric(10,2) not null default 0,
  -- Fiscal (preenchido na Fase 4 — NFS-e):
  num_rps           text,
  num_nfse          text,
  num_lote          text,
  -- Auditoria de operador (usuarioe/usuarios/usuarioa do legado):
  usuario_entrada   uuid references perfis (id),
  usuario_saida     uuid references perfis (id),
  usuario_altera    uuid references perfis (id),
  dt_altera         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table movimentos is 'Log de entrada/saída (ESTALANC). Append-only; saída preenche dt_saida/valores.';
-- Índice-constraint: no máximo 1 veículo ABERTO por placa/filial (como no legado).
create unique index movimentos_aberto_por_placa_idx
  on movimentos (filial_id, placa) where dt_saida is null;
create index movimentos_filial_entrada_idx on movimentos (filial_id, dt_entrada);
create index movimentos_filial_saida_idx   on movimentos (filial_id, dt_saida);
create index movimentos_placa_idx          on movimentos (filial_id, placa);

-- Pagamentos do movimento (split: até 3 formas no legado, aqui 1:N)
create table movimento_pagamentos (
  id               uuid primary key default gen_random_uuid(),
  filial_id        uuid not null references filiais (id),  -- denormalizado p/ RLS
  movimento_id     uuid not null references movimentos (id) on delete cascade,
  forma_pagamento  text not null,                 -- codigo da forma
  valor            numeric(10,2) not null,
  created_at       timestamptz not null default now()
);
comment on table movimento_pagamentos is 'Rateio de pagamento por forma (split dinheiro+cartão etc.).';
create index mov_pagtos_idx on movimento_pagamentos (movimento_id);

-- =============================================================================
-- 10. Gatilhos de updated_at
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'filiais','perfis','formas_pagamento','tabelas_preco','modelos_veiculo',
    'convenios','mensalistas','mensalidades','vagas','clientes','movimentos'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on %I
         for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- Fim de 0001. A segurança (RLS) fica em 0002_rls.sql.
