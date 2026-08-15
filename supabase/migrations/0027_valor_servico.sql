-- =============================================================================
-- 0027_valor_servico.sql — valor informado ao marcar um serviço "Pede valor"
--
-- Serviço cuja tabela de preço tem faixa tipo_cobranca='valor' (ver 0024):
-- pergunta o valor na hora de MARCAR o serviço (não na saída, como as demais
-- faixas 'valor') — é o uso normal desse tipo de faixa (preço variável por
-- serviço, ex.: lavagem cujo preço depende do carro). Ver src/telas/Patio.jsx.
-- =============================================================================

alter table movimento_servicos add column valor numeric;
comment on column movimento_servicos.valor is
  'Valor informado pelo operador ao marcar o serviço (só quando a tabela do serviço tem faixa tipo_cobranca=valor). Null = serviço cobrado pela tabela normalmente, calculado na saída.';
