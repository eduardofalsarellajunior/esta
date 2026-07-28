-- =============================================================================
-- 0008_remove_pernoite.sql — remove pernoite/diária do motor de tarifação
-- Ninguém usa essa cobrança hoje. Remove os 4 campos correspondentes de
-- tabelas_preco. O motor (packages/tarifacao) já não lê mais essas colunas.
-- ⚠️ Isso apaga qualquer configuração de pernoite ainda existente (ex.: a
-- tabela "P" tinha 18h-5h/diária R$50/tolerância 99% no seed de referência).
-- =============================================================================

alter table tabelas_preco
  drop column pernoite_ini,
  drop column pernoite_fim,
  drop column valor_diaria,
  drop column tolerancia_pct;
