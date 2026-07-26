-- =============================================================================
-- 0006_tabelas_selecao_manual.sql — flag de seleção manual na Entrada
-- Marca quais tabelas de preço podem ser escolhidas manualmente pelo operador
-- quando o carro não está no catálogo (modelos_veiculo). Nasce "false" em todas
-- as tabelas existentes — o supervisor libera quais quiser na tela de Preços.
-- =============================================================================

alter table tabelas_preco
  add column selecao_manual boolean not null default false;

comment on column tabelas_preco.selecao_manual is
  'Se true, aparece na seleção manual de tabela quando o carro não está no catálogo de modelos.';
