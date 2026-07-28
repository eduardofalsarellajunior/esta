-- =============================================================================
-- 0009_perfis_email.sql — e-mail de referência em perfis
-- Só pra identificação na tela de Usuários (não é usado pra autenticação —
-- o e-mail de login continua em auth.users, gerenciado pelo Supabase).
-- =============================================================================

alter table perfis add column email text;

comment on column perfis.email is
  'E-mail de referência (exibição). Não usado para autenticação — login fica em auth.users.';
