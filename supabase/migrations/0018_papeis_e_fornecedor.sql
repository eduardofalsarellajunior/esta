-- =============================================================================
-- 0018_papeis_e_fornecedor.sql — escada de papéis e o acesso multi-cliente
--
-- Papéis, do menor pro maior:
--   operador    · pátio e caixa
--   gerente     · + painel, mensalistas, convênios, serviços, modelos de
--                 veículo, fiscal e contas a receber
--   supervisor  · tudo da filial (preços, usuários, financeiro completo)
--   fornecedor  · quem mantém o sistema: acessa TODAS as filiais, escolhendo
--                 qual quer ver, e é o único que altera os dados do
--                 estacionamento (razão social, endereço, fiscal…)
--
-- A ideia central é a filial ativa: em vez de reescrever as ~30 policies que
-- usam `filial_do_usuario()`, a escolha do fornecedor entra por dentro dessa
-- função. Pra todo mundo que não é fornecedor, nada muda.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Papéis novos e a filial ativa
-- -----------------------------------------------------------------------------
alter table perfis drop constraint if exists perfis_papel_check;
alter table perfis add constraint perfis_papel_check
  check (papel in ('operador', 'gerente', 'supervisor', 'fornecedor'));

alter table perfis add column if not exists filial_ativa uuid references filiais (id);
comment on column perfis.filial_ativa is
  'Só para fornecedor: a filial que ele escolheu acessar agora. Null = usa filial_id.';

-- -----------------------------------------------------------------------------
-- 2. Funções da RLS
-- -----------------------------------------------------------------------------
create or replace function filial_do_usuario()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(filial_ativa, filial_id) from perfis where id = auth.uid();
$$;
comment on function filial_do_usuario is
  'Filial que o usuário está enxergando (base da RLS). Fornecedor troca via filial_ativa.';

create or replace function usuario_eh_fornecedor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select papel = 'fornecedor' from perfis where id = auth.uid()), false);
$$;
comment on function usuario_eh_fornecedor is
  'Quem mantém o sistema: acessa todas as filiais e altera os dados do estacionamento.';

-- Fornecedor tem, por definição, todo poder de supervisor.
create or replace function usuario_eh_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select papel in ('supervisor', 'fornecedor') from perfis where id = auth.uid()),
    false);
$$;

-- -----------------------------------------------------------------------------
-- 3. filiais: fornecedor vê todas (precisa da lista pra escolher) e é o único
--    que altera. Aqui o bloqueio é do banco, não da tela — vale mesmo pra quem
--    chamar a API por fora do app.
-- -----------------------------------------------------------------------------
drop policy if exists filiais_select on filiais;
create policy filiais_select on filiais for select to authenticated
  using (id = filial_do_usuario() or usuario_eh_fornecedor());

drop policy if exists filiais_update on filiais;
create policy filiais_update on filiais for update to authenticated
  using (usuario_eh_fornecedor())
  with check (usuario_eh_fornecedor());

-- -----------------------------------------------------------------------------
-- 4. perfis: o usuário sempre enxerga a própria linha
--    O fornecedor operando outra filial tem a linha dele em OUTRA filial — sem
--    isso o app não conseguiria nem carregar o próprio perfil no login.
--    Escrita passa a exigir supervisor (antes qualquer um da filial editava
--    perfis, o que deixava um operador se promover).
-- -----------------------------------------------------------------------------
drop policy if exists perfis_tenant_select on perfis;
create policy perfis_tenant_select on perfis for select to authenticated
  using (filial_id = filial_do_usuario() or id = auth.uid());

drop policy if exists perfis_tenant_update on perfis;
create policy perfis_tenant_update on perfis for update to authenticated
  using ((filial_id = filial_do_usuario() and usuario_eh_supervisor()) or id = auth.uid())
  with check ((filial_id = filial_do_usuario() and usuario_eh_supervisor()) or id = auth.uid());

drop policy if exists perfis_tenant_insert on perfis;
create policy perfis_tenant_insert on perfis for insert to authenticated
  with check (filial_id = filial_do_usuario() and usuario_eh_supervisor());

drop policy if exists perfis_tenant_delete on perfis;
create policy perfis_tenant_delete on perfis for delete to authenticated
  using (filial_id = filial_do_usuario() and usuario_eh_supervisor());

-- -----------------------------------------------------------------------------
-- 5. Trava de escalada de privilégio
--    As policies acima deixam o usuário editar a própria linha (necessário pro
--    fornecedor trocar de filial). Sem esta trava, seria o caminho pra alguém
--    se promover sozinho.
-- -----------------------------------------------------------------------------
create or replace function perfis_guarda_papel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role (scripts admin e api/criar-usuario.js) não tem auth.uid();
  -- ele já ignora RLS por natureza, então travar aqui seria só teatro.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.papel is distinct from old.papel and not usuario_eh_supervisor() then
    raise exception 'Só supervisor pode mudar o papel de um usuário.';
  end if;

  if new.papel = 'fornecedor' and not usuario_eh_fornecedor() then
    raise exception 'Só o fornecedor pode criar outro fornecedor.';
  end if;

  if tg_op = 'UPDATE' and old.papel = 'fornecedor' and not usuario_eh_fornecedor() then
    raise exception 'Só o fornecedor pode alterar o perfil de um fornecedor.';
  end if;

  if tg_op = 'UPDATE' and new.filial_ativa is distinct from old.filial_ativa
     and not usuario_eh_fornecedor() then
    raise exception 'Só o fornecedor pode trocar a filial ativa.';
  end if;

  if tg_op = 'UPDATE' and new.filial_id is distinct from old.filial_id
     and not usuario_eh_fornecedor() then
    raise exception 'Só o fornecedor pode mover um usuário de filial.';
  end if;

  return new;
end;
$$;

drop trigger if exists perfis_guarda_papel_trg on perfis;
create trigger perfis_guarda_papel_trg before insert or update on perfis
  for each row execute function perfis_guarda_papel();

-- =============================================================================
-- 6. PASSO MANUAL — promover o primeiro fornecedor
--
-- Não dá pra criar o primeiro fornecedor pelo app (só um fornecedor cria
-- outro), então esta primeira vez é na mão. Troque o e-mail e rode:
--
--   update perfis set papel = 'fornecedor'
--    where id = (select id from auth.users where email = 'seu-email@exemplo.com');
--
-- Depois disso, o app pede qual estacionamento acessar no login, e os demais
-- fornecedores saem pela tela de Usuários.
-- =============================================================================
