-- Forma de pagamento "Devedor" (ver Cadastros -> Formas de pagamento): valor
-- pago com ela não é recebido agora, vira saldo devedor da placa, cobrado
-- junto com a estadia da próxima entrada dela (ver Patio.jsx).

alter table formas_pagamento add column eh_devedor boolean not null default false;
comment on column formas_pagamento.eh_devedor is
  'Forma "Devedor" -- valor pago com ela não é recebido agora: vira saldo devedor da placa (clientes.saldo_devedor), cobrado junto com a próxima estadia (ver Patio.jsx).';

alter table clientes add column saldo_devedor numeric(10,2) not null default 0;
comment on column clientes.saldo_devedor is
  'Quanto essa placa deve -- gravado na saída quando parte do pagamento usa a forma "Devedor" (eh_devedor), consumido (somado ao valor calculado, via movimentos.valor_dev/dividaAnterior) na saída seguinte.';
