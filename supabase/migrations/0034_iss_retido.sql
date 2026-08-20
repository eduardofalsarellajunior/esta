-- =============================================================================
-- 0034_iss_retido.sql — memória de recolhimento de ISS (A/R), por mensalista
-- e por placa (ver src/lib/issRetido.js)
--
-- Legado: cadastro do mensalista tinha um campo A (normal, o estacionamento
-- recolhe) ou R (retido, o tomador recolhe). Pra qualquer tomador (avulso
-- incluído), o tipo de recolhimento era perguntado e guardado na PLACA do
-- veículo, pra não perguntar de novo na próxima visita.
-- =============================================================================

alter table mensalistas add column iss_retido text check (iss_retido in ('A', 'R'));
comment on column mensalistas.iss_retido is
  'A = normal, o estacionamento recolhe o ISS. R = retido, o tomador (este mensalista) recolhe. NULL = não sabido ainda, usa o padrão da filial (config.nfse.abrasf.issRetido). Usado no DPS/RPS do recebimento de mensalidade (ver ReceberMensalidade.jsx).';

alter table clientes add column iss_retido text check (iss_retido in ('A', 'R'));
comment on column clientes.iss_retido is
  'Igual mensalistas.iss_retido, mas por PLACA (clientes já é a memória por placa entre visitas — telefone, pontos de fidelidade). Some a primeira vez que um tomador é pedido pra aquela placa (Pátio ou correção de nota) e é reaproveitado nas próximas, sem perguntar de novo. Ver src/lib/issRetido.js.';
