-- =============================================================================
-- 0047_limpeza_lancamentos_antigos.sql — exclusão definitiva de movimentos
-- (pátio) mais antigos que N dias, configurável por filial.
--
-- Mesmo parâmetro do sistema legado: "guardar por X dias". Protege RPS/DPS
-- ainda não finalizado (sem numero_nfse — não foi enviado/autorizado pela
-- prefeitura ainda), mesmo que o movimento já tenha vencido o prazo. Uma vez
-- com numero_nfse, o RPS/DPS pode ser excluído junto com o movimento.
-- =============================================================================

alter table filiais add column dias_guarda_lancamentos integer;
comment on column filiais.dias_guarda_lancamentos is
  'Dias que um movimento encerrado (com saída ou excluído) fica guardado antes de poder ser excluído em Configurações → Limpeza de lançamentos antigos. NULL = limpeza desligada. Configurado só pelo fornecedor (dado com efeito legal/fiscal).';

-- Nota fiscal segue o movimento na exclusão (só é alcançada quando já tem
-- numero_nfse — ver limpar_lancamentos_antigos() abaixo, que nunca inclui um
-- movimento com RPS/DPS pendente no conjunto apagado).
alter table notas_fiscais drop constraint notas_fiscais_movimento_id_fkey;
alter table notas_fiscais add constraint notas_fiscais_movimento_id_fkey
  foreign key (movimento_id) references movimentos (id) on delete cascade;

-- Conjunto elegível: movimento encerrado (dt_saida) ou cancelado (excluido_em)
-- há mais dias que o parâmetro, SEM nenhuma nota fiscal ainda sem numero_nfse.
create or replace function contar_lancamentos_antigos()
returns table (dias integer, elegiveis integer, notas_junto integer, protegidos integer)
language sql
security definer
set search_path = public
stable
as $$
  with fil as (
    select id, dias_guarda_lancamentos as d from filiais where id = filial_do_usuario()
  ),
  base as (
    select m.id from movimentos m, fil
    where m.filial_id = fil.id and fil.d is not null
      and (
        (m.dt_saida is not null and m.dt_saida < current_date - fil.d)
        or (m.excluido_em is not null and m.excluido_em < now() - (fil.d || ' days')::interval)
      )
  ),
  protegidos as (
    select distinct nf.movimento_id from notas_fiscais nf
    where nf.movimento_id in (select id from base) and nf.numero_nfse is null
  ),
  elegiveis as (
    select id from base where id not in (select movimento_id from protegidos)
  )
  select
    (select d from fil),
    (select count(*)::int from elegiveis),
    (select count(*)::int from notas_fiscais where movimento_id in (select id from elegiveis) and numero_nfse is not null),
    (select count(*)::int from protegidos);
$$;
comment on function contar_lancamentos_antigos is
  'Prévia (sem apagar nada) de quantos movimentos a filial do usuário logado pode excluir agora — ver limpar_lancamentos_antigos().';

create or replace function limpar_lancamentos_antigos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filial uuid := filial_do_usuario();
  v_dias integer;
  v_deletados integer;
begin
  if not usuario_eh_supervisor() then
    raise exception 'Só supervisor pode limpar lançamentos antigos.';
  end if;
  select dias_guarda_lancamentos into v_dias from filiais where id = v_filial;
  if v_dias is null then
    raise exception 'Dias de guarda não configurado (Configurações → fornecedor).';
  end if;

  with elegiveis as (
    select m.id from movimentos m
    where m.filial_id = v_filial
      and (
        (m.dt_saida is not null and m.dt_saida < current_date - v_dias)
        or (m.excluido_em is not null and m.excluido_em < now() - (v_dias || ' days')::interval)
      )
      and not exists (
        select 1 from notas_fiscais nf
        where nf.movimento_id = m.id and nf.numero_nfse is null
      )
  )
  delete from movimentos where id in (select id from elegiveis);
  get diagnostics v_deletados = row_count;
  return v_deletados;
end;
$$;
comment on function limpar_lancamentos_antigos is
  'Exclui definitivamente (sem recuperação) os movimentos elegíveis da filial do usuário logado — cascade apaga junto movimento_pagamentos, movimento_servicos e notas_fiscais (só as já finalizadas, com numero_nfse). Exige supervisor.';
