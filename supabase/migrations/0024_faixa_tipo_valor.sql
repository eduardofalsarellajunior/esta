-- =============================================================================
-- 0024_faixa_tipo_valor.sql — faixa "Valor": sem número configurado, pergunta
-- ao operador na saída (ver packages/tarifacao/README.md e src/telas/Patio.jsx).
--
-- Terceira opção de tipo_cobranca, ao lado de 'fixo' e 'hora' (0007). Aditivo:
-- nenhuma faixa existente muda de tipo sozinha.
-- =============================================================================

alter table tabela_preco_faixas
  drop constraint tabela_preco_faixas_tipo_cobranca_check;

alter table tabela_preco_faixas
  add constraint tabela_preco_faixas_tipo_cobranca_check
  check (tipo_cobranca in ('fixo', 'hora', 'valor'));

comment on column tabela_preco_faixas.tipo_cobranca is
  'fixo: valor cheio da faixa. hora: taxa por período (ver periodo). valor: sem número configurado — o operador informa quanto cobrar na saída.';
