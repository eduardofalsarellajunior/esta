-- =============================================================================
-- 0007_faixas_tipo_cobranca.sql — faixas fixas ou por hora + remove "por minuto"
-- Remove a flag `por_minuto` (nunca foi lida pelo motor de tarifação — código
-- morto). Adiciona `tipo_cobranca` em tabela_preco_faixas: 'fixo' (valor cheio
-- da faixa, como hoje) ou 'hora' (valor_hora vira taxa por hora, cobrada
-- cumulativamente a partir do teto da faixa anterior, arredondando pra cima).
-- Default 'fixo' preserva o comportamento atual de TODAS as faixas existentes.
-- =============================================================================

alter table tabelas_preco drop column por_minuto;

alter table tabela_preco_faixas
  add column tipo_cobranca text not null default 'fixo'
    check (tipo_cobranca in ('fixo', 'hora'));

comment on column tabela_preco_faixas.tipo_cobranca is
  'fixo = valor cheio da faixa (padrão/atual); hora = valor_hora é taxa por hora, cumulativa a partir do teto da faixa anterior, arredondada pra cima.';
