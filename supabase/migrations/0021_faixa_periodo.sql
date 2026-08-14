-- =============================================================================
-- 0021_faixa_periodo.sql — período de cobrança configurável nas faixas "hora"
--
-- Antes, faixa "por hora" cobrava sempre em blocos de 1 hora (fração
-- arredondada pra cima). Agora o tamanho do bloco é configurável por faixa —
-- 0.30 (30 min), 1.00 (1h, padrão), 24.00 (24h) etc.
--
-- Default 1.00 preserva o comportamento de sempre nas faixas já cadastradas:
-- nenhuma tabela existente muda de valor sozinha.
-- =============================================================================

alter table tabela_preco_faixas
  add column periodo hora_comercial not null default 1.00;

comment on column tabela_preco_faixas.periodo is
  'Duração do período de cobrança em faixas "por hora" (1.00 = 1h, padrão; 0.30 = 30min; 24.00 = 24h). Ignorado em faixas "fixo".';
