-- =============================================================================
-- 0026_senha_mes.sql — "senha do mês" (anti-calote do Eduardo/fornecedor)
--
-- Ver src/lib/senhaMes.ts (cálculo) + api/conferir-senha-mes.js +
-- api/cadastrar-senha-mes.js. O cálculo em si NUNCA roda no navegador — só
-- nessas duas Vercel Functions, pra ninguém conseguir computar a senha
-- sozinho a partir do "Núm. Cliente" que já aparece na tela.
-- =============================================================================

alter table filiais add column senha_mes_liberada_em date;
comment on column filiais.senha_mes_liberada_em is
  'Primeiro dia do último mês em que a "senha do mês" foi conferida com sucesso (ver src/lib/senhaMes.ts + api/conferir-senha-mes.js). Login trava até bater a senha do mês corrente. Não é sensível — só diz "mês X já liberado", não guarda a senha em si.';

create table senhas_mes_fila (
  id uuid primary key default gen_random_uuid(),
  filial_id uuid not null references filiais(id) on delete cascade,
  senha text not null,
  criado_em timestamptz not null default now()
);
comment on table senhas_mes_fila is
  'Fila (FIFO por criado_em) de senhas do mês pré-cadastradas por uma filial, ainda não consumidas. Deliberadamente SEM policy de RLS pra authenticated/anon: só service_role (api/*.js) lê ou escreve aqui, pra a fila nunca poder ser lida direto do navegador.';
alter table senhas_mes_fila enable row level security;
-- Nenhuma policy criada de propósito — RLS ligada + zero policy = acesso
-- negado por padrão pra qualquer role exceto service_role (que bypassa RLS).
