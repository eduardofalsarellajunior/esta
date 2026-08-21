-- =============================================================================
-- 0038_reservas_chegou.sql — marca quando o carro da reserva realmente
-- chegou (deu entrada no Pátio), sem mexer no `status`.
--
-- Por que não muda o `status` na entrada: uma reserva de vários dias (ex.:
-- 15 dias) continua ocupando a vaga por todo o período, mesmo depois do
-- carro chegar no primeiro dia — se a entrada marcasse `status='concluida'`
-- ali, a conta de capacidade (ver src/lib/reservas.js) liberaria os dias
-- seguintes por engano, deixando o sistema vender a mesma vaga duas vezes.
-- `chegou_em` é só um indicador visual à parte; `status` continua 100%
-- manual (Concluída/Não veio/Excluir), do jeito que já era.
-- =============================================================================

alter table reservas add column chegou_em timestamptz;
comment on column reservas.chegou_em is
  'Quando o carro desta reserva deu entrada no Pátio (ver Patio.jsx, registrarEntrada) — só um indicador, não muda o status nem a conta de capacidade.';
