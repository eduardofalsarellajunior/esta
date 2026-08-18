-- =============================================================================
-- 0029_avarias.sql — anotação de avarias na entrada do veículo
--
-- Só o texto (até 5 linhas de 50 caracteres, validado no app) — as fotos
-- ficam de propósito fora do banco/sistema, baixadas direto pro aparelho de
-- quem registra (ver botão "Avarias" em src/telas/Patio.jsx).
-- =============================================================================

alter table movimentos add column avarias text;
comment on column movimentos.avarias is
  'Nota de avarias registrada na entrada (até 5 linhas de 50 caracteres). Fotos não ficam aqui — vão direto pro aparelho de quem registrou.';
