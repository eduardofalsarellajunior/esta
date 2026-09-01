-- =============================================================================
-- 0049_convenio_cadastro.sql — dados cadastrais do convênio
--
-- `convenios` só guardava o necessário pro desconto (razão, CNPJ, inscrição e
-- as regras). Alguns clientes emitem DPS/RPS PRO CONVÊNIO (a nota sai no nome
-- da empresa conveniada, não do motorista) — pra isso precisa do endereço
-- completo do tomador, igual já existe em `mensalistas`.
--
-- Também é o que a importação do ESTACONV.dbf (tipo C/V) traz do legado —
-- ver packages/dbf/mapeamento.ts, destino `convenios`.
-- =============================================================================

alter table convenios
  add column grupo     text,
  add column endereco  text,
  add column numero    text,
  add column bairro    text,
  add column cidade    text,
  add column uf        text,
  add column cep       text,
  add column telefone  text,
  add column email     text,
  add column cod_ibge  text;

comment on column convenios.grupo is
  'Agrupamento livre do legado (GRUPO) — junta convênios de uma mesma rede/matriz. Só organização, não afeta cobrança.';
comment on column convenios.cod_ibge is
  'Código IBGE do município do convênio — exigido no DPS/RPS quando a nota é emitida pro convênio como tomador (mesmo papel do mensalistas.cod_ibge, ver 0028).';
