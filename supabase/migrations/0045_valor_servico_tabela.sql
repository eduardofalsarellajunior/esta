-- Valor FIXO do serviço (legado VALORSERV, ESTAHORA.DBF) — separado da
-- estadia (faixas). Quando a tabela é usada como Serviço (ver Cadastros →
-- Serviços, tabela_tipo), esse valor soma direto ao total; quando é usada
-- como tabela normal de veículo, não tem efeito nenhum (ver packages/tarifacao).

alter table tabelas_preco add column valor_servico numeric(10,2) not null default 0;
comment on column tabelas_preco.valor_servico is
  'Valor FIXO do serviço (legado VALORSERV) — só conta quando a tabela é usada em servicosTipos (ver Cadastros → Serviços): soma direto ao total, separado da estadia calculada pelas faixas.';
