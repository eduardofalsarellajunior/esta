-- =============================================================================
-- 0020_controle_movimento.sql — número de controle do ticket (@C#@)
--
-- Um sequencial curto, entregue na entrada e ditado na saída: bem mais rápido
-- que soletrar placa na cabine. É o `CONTROLE:` que o ticket do sistema antigo
-- já imprimia em destaque (token @C#@ — no legado era o `wnfiscal`).
--
-- Regra: único entre os veículos QUE ESTÃO no pátio. Quando o carro sai, o
-- número volta pro bolo e pode ser reaproveitado — como no legado, que também
-- girava a numeração (FUNCTION SEMCHAPA, 1..9999).
-- =============================================================================

alter table movimentos add column controle integer;
comment on column movimentos.controle is
  'Número de controle do ticket (@C#@). Único entre os veículos no pátio; reaproveitado depois da saída.';

-- A garantia de "não repete no pátio" é do banco, não da aplicação: mesmo com
-- duas cabines dando entrada ao mesmo tempo, a segunda leva erro de duplicidade
-- e o app tenta o número seguinte.
create unique index movimentos_controle_patio_uidx
  on movimentos (filial_id, controle)
  where dt_saida is null and excluido_em is null and controle is not null;

-- Índice de busca: na saída, o operador digita o número no campo da placa.
create index movimentos_controle_idx on movimentos (filial_id, controle)
  where dt_saida is null and excluido_em is null;

/**
 * Próximo número livre: continua de onde a numeração parou e pula os que estão
 * ocupados no pátio, dando a volta ao chegar no teto.
 *
 * Security invoker de propósito — a RLS do chamador se aplica, então ninguém
 * consegue sondar a numeração de outra filial por aqui.
 */
create or replace function proximo_controle(p_filial uuid, p_max integer default 9999)
returns integer
language sql
stable
as $$
  with ultimo as (
    select coalesce((
      select controle from movimentos
       where filial_id = p_filial and controle is not null
       order by created_at desc
       limit 1), 0) as n
  ),
  ocupados as (
    select controle from movimentos
     where filial_id = p_filial
       and controle is not null
       and dt_saida is null
       and excluido_em is null
  )
  select cand
    from (
      select i, (((select n from ultimo) + i - 1) % p_max) + 1 as cand
        from generate_series(1, p_max) as i
    ) t
   where cand not in (select controle from ocupados)
   order by i
   limit 1;
$$;
comment on function proximo_controle is
  'Próximo número de controle livre da filial (continua a sequência, pula os ocupados, dá a volta no teto).';
