-- =============================================================================
-- 0029_mensalista_cod_ibge.sql — código IBGE do município no cadastro do mensalista
--
-- Precisa disso pra montar o RPS/DPS certo do tomador (hoje o XML usa o
-- município da FILIAL até pro tomador, porque não tinha de onde tirar o
-- código dele — ver src/lib/fiscal.js). Vem junto com o seletor de cidade
-- (ver 0028_municipios_ibge.sql) em Mensalistas.jsx.
-- =============================================================================

alter table mensalistas add column cod_ibge text;
comment on column mensalistas.cod_ibge is
  'Código IBGE de 7 dígitos do município (ver municipios_ibge) — usado no RPS/DPS do mensalista como tomador.';
