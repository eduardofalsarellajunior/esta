-- =============================================================================
-- 0032_limite_usuarios_simultaneos.sql — limite de usuários logados ao mesmo
-- tempo por filial (controle de licenciamento do fornecedor)
--
-- Ver api/sessao-heartbeat.js + src/telas/SessoesGate.jsx. A contagem é em
-- tempo real (heartbeat), diferente da "senha do mês" (0026), que é uma
-- checagem mensal única.
-- =============================================================================

alter table filiais add column limite_usuarios_simultaneos integer;
comment on column filiais.limite_usuarios_simultaneos is
  'Máximo de usuários (perfis) logados ao mesmo tempo nesta filial — controle de licenciamento do fornecedor. NULL = sem limite. Ver sessoes_ativas e api/sessao-heartbeat.js.';

create table sessoes_ativas (
  id uuid primary key default gen_random_uuid(),
  filial_id uuid not null references filiais(id) on delete cascade,
  perfil_id uuid not null references perfis(id) on delete cascade,
  ultimo_ping timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  unique (filial_id, perfil_id)
);
create index sessoes_ativas_filial_idx on sessoes_ativas (filial_id);
comment on table sessoes_ativas is
  'Presença ativa (heartbeat) por usuário, só pra contar usuários simultâneos contra filiais.limite_usuarios_simultaneos (ver api/sessao-heartbeat.js). Linha expira sozinha (é apagada) depois de alguns minutos sem heartbeat — sem depender de logout explícito. Deliberadamente SEM policy de RLS: só service_role (api/*.js) mexe aqui, igual senhas_mes_fila (0026).';
alter table sessoes_ativas enable row level security;
-- Nenhuma policy criada de propósito — RLS ligada + zero policy = acesso
-- negado por padrão pra qualquer role exceto service_role (que bypassa RLS).
