-- =============================================================================
-- 0037_reservas_modelo.sql — modelo do veículo na reserva
--
-- Usado no ticket da reserva (ver modelosPadrao.js/dadosTicket.js) e, se
-- bater com o catálogo modelos_veiculo (mesmo nome), permite dar entrada
-- automática no dia da reserva sem precisar completar a tabela na mão
-- (ver src/telas/Patio.jsx, detectar()).
-- =============================================================================

alter table reservas add column modelo text;
comment on column reservas.modelo is
  'Modelo do veículo (opcional) — usado no ticket da reserva e, se bater com o catálogo modelos_veiculo (mesmo nome), permite dar entrada automática no dia da reserva sem precisar completar a tabela na mão.';
