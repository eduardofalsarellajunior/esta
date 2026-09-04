-- =============================================================================
-- 0052_hardening_seguranca.sql — correções do advisor de segurança do Supabase
--
-- Achados reais (ver conversa de 2026-09-04, "quanto estamos vulneráveis"):
--
-- 1. ERRO: `semparar_sequencias` (0051) foi criada sem RLS — única tabela do
--    banco inteiro nessa situação. Sem RLS, qualquer usuário autenticado de
--    QUALQUER filial conseguia ler/escrever a sequência de NSU de qualquer
--    OUTRA filial (não é dado sensível em si — é só um contador — mas quebra
--    o isolamento por filial que o resto do app garante em toda parte).
--
-- 2. AVISO: `limpar_lancamentos_antigos()` e `contar_lancamentos_antigos()`
--    (0047) são SECURITY DEFINER e ficaram expostas via RPC pro papel `anon`
--    (ninguém logado). Já tinham proteção própria por dentro
--    (usuario_eh_supervisor(), filial_do_usuario() — pra anon, sem sessão,
--    os dois voltam null/false e a chamada é recusada ou não acha nada), mas
--    não faz sentido deixar a porta nem entreaberta pra quem não logou.
--
-- 3. AVISO: mesma exposição a `anon` em `tamanho_banco_bytes()` (Painel de
--    uso, só fornecedor usa) e `registrar_acesso()` (chamada só depois do
--    login). Revoga só de `anon` — `authenticated` continua podendo, é
--    dessas duas que o app depende.
--
-- 4. AVISO: `set_updated_at`, `proximo_controle`, `caixas_definir_numero` e
--    `proximo_nsu_semparar` sem `search_path` fixado. Nenhuma é SECURITY
--    DEFINER (rodam com o privilégio de quem chama, não dá pra escalar
--    privilégio por aqui), mas fixar é a prática recomendada pelo próprio
--    linter do Supabase, sem contrapartida nenhuma.
--
-- NÃO mexido (risco de quebrar login/RLS pra reduzir uma exposição que já é
-- inofensiva): filial_do_usuario(), usuario_eh_supervisor(),
-- usuario_eh_fornecedor() — são chamadas de DENTRO das policies de RLS de
-- toda tabela; revogar EXECUTE de `authenticated` nelas quebraria a RLS
-- inteira pra todo mundo logado. Pra `anon` (sem sessão), elas só devolvem
-- null/false — inofensivo mesmo exposta. perfis_guarda_papel() é função de
-- TRIGGER (retorna `trigger`): o Postgres recusa chamar isso fora de um
-- gatilho, não é invocável via RPC de jeito nenhum, aviso é falso-positivo.
-- =============================================================================

alter table semparar_sequencias enable row level security;
create policy semparar_sequencias_tenant_select on semparar_sequencias for select to authenticated
  using (filial_id = filial_do_usuario());
create policy semparar_sequencias_tenant_insert on semparar_sequencias for insert to authenticated
  with check (filial_id = filial_do_usuario());
create policy semparar_sequencias_tenant_update on semparar_sequencias for update to authenticated
  using (filial_id = filial_do_usuario()) with check (filial_id = filial_do_usuario());

-- Revogar só de `anon` não basta: por padrão o Postgres concede EXECUTE a
-- PUBLIC (pseudo-papel do qual `anon` também herda) na criação da função —
-- é preciso revogar de PUBLIC e conceder de volta explicitamente a quem
-- precisa (`authenticated`, que é quem o app usa de verdade).
revoke execute on function limpar_lancamentos_antigos() from public;
revoke execute on function contar_lancamentos_antigos() from public;
revoke execute on function tamanho_banco_bytes() from public;
revoke execute on function registrar_acesso() from public;

grant execute on function limpar_lancamentos_antigos() to authenticated;
grant execute on function contar_lancamentos_antigos() to authenticated;
grant execute on function tamanho_banco_bytes() to authenticated;
grant execute on function registrar_acesso() to authenticated;

alter function set_updated_at() set search_path = public;
alter function proximo_controle(uuid, integer) set search_path = public;
alter function caixas_definir_numero() set search_path = public;
alter function proximo_nsu_semparar(uuid, text) set search_path = public;
