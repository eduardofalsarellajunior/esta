-- =============================================================================
-- 0015_mensalista_numero_endereco.sql — número do endereço do mensalista
-- O cadastro já tinha endereco/bairro/cidade/uf/cep (0001_core_schema.sql),
-- mas faltava o número — acrescentado agora pra completar o endereço (e
-- ficar disponível como coluna de destino na importação de .dbf).
-- =============================================================================

alter table mensalistas
  add column numero text;

comment on column mensalistas.numero is 'Número do endereço (rua/av. já existe em endereco).';
