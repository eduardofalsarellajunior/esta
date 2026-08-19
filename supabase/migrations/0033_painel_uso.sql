-- =============================================================================
-- 0033_painel_uso.sql — Painel de uso do fornecedor: contadores de
-- reconhecimentos de placa e acessos por filial, tamanho do banco (total),
-- e leitura de sessoes_ativas pro fornecedor ver quem está online agora.
--
-- Ver src/telas/PainelFornecedor.jsx, App.jsx (registrar_acesso) e
-- supabase/functions/ler-placa/index.ts (registrar_reconhecimento_placa).
-- =============================================================================

alter table filiais add column contagem_reconhecimentos_placa integer not null default 0;
alter table filiais add column contagem_acessos integer not null default 0;
comment on column filiais.contagem_reconhecimentos_placa is
  'Contador acumulado de chamadas bem-sucedidas ao leitor de placas (ver supabase/functions/ler-placa e registrar_reconhecimento_placa()). Fornecedor zera pelo Painel de uso quando quiser.';
comment on column filiais.contagem_acessos is
  'Contador acumulado de logins (ver registrar_acesso()). Fornecedor zera pelo Painel de uso quando quiser.';

-- Chamada pelo app logo após um login bem-sucedido (App.jsx) — incrementa
-- SÓ a própria filial de quem chama (via filial_do_usuario()), então é
-- seguro deixar qualquer usuário autenticado executar.
create or replace function registrar_acesso()
returns void
language sql
security definer
set search_path = public
as $$
  update filiais set contagem_acessos = contagem_acessos + 1 where id = filial_do_usuario();
$$;

-- Chamada só pela Edge Function ler-placa (que usa a service role key) —
-- recebe a filial explícita, então NÃO pode ficar aberta pra authenticated/
-- anon (um usuário mal-intencionado poderia inflar o contador de outra
-- filial). Revoga de todo mundo, libera só pra service_role.
create or replace function registrar_reconhecimento_placa(p_filial_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update filiais set contagem_reconhecimentos_placa = contagem_reconhecimentos_placa + 1 where id = p_filial_id;
$$;
-- "revoke ... from public" sozinho não basta: o Supabase concede EXECUTE
-- explicitamente pra anon/authenticated em toda função nova (não é só
-- herdado de PUBLIC) — precisa revogar dos três.
revoke all on function registrar_reconhecimento_placa(uuid) from public, anon, authenticated;
grant execute on function registrar_reconhecimento_placa(uuid) to service_role;

-- Tamanho do banco inteiro (não por filial) — só devolve valor pro
-- fornecedor; qualquer outro usuário recebe null.
create or replace function tamanho_banco_bytes()
returns bigint
language sql
security definer
set search_path = public
as $$
  select case when usuario_eh_fornecedor() then pg_database_size(current_database()) else null end;
$$;

-- sessoes_ativas (0032) hoje não tem policy nenhuma (só service_role
-- acessa) — o fornecedor precisa enxergar quem está online pro Painel de uso.
create policy sessoes_ativas_select_fornecedor on sessoes_ativas for select to authenticated
  using (usuario_eh_fornecedor());
