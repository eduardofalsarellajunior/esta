-- =============================================================================
-- 0036_limpeza_reservas_antigas.sql — mantém histórico de reservas por 1 mês
-- depois que terminam, e limpa sozinho depois disso.
--
-- Roda dentro do próprio Postgres (pg_cron), todo dia de madrugada — não
-- depende de nenhum serviço externo (Vercel cron, etc.) ficar no ar.
-- =============================================================================

create extension if not exists pg_cron;

select cron.schedule(
  'limpar_reservas_antigas',
  '0 3 * * *', -- todo dia às 3h (horário do servidor do Postgres, normalmente UTC)
  $$ delete from reservas where data_fim < current_date - 30 $$
);
