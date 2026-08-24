-- =============================================================================
-- 0042_produtos.sql — cadastro de produtos (balcão) + venda avulsa.
--
-- Produto físico vendido no balcão (água, refrigerante, item de loja...) —
-- NADA a ver com os "Serviços" já existentes (lavagem etc., que têm tabela de
-- preço própria e entram no cálculo da saída do pátio, ver packages/tarifacao).
-- Venda de produto é avulsa, recebida na hora em qualquer forma de pagamento,
-- e NUNCA gera RPS/NFS-e — essa filial só tem homologação pra nota de SERVIÇO
-- de estacionamento (ver Fiscal.jsx/notaFiscal.js); misturar venda de
-- mercadoria ali quebraria a nota fiscal real. Por isso vendas_produtos não
-- referencia notas_fiscais nem é tocada por criarNotaFiscal em lugar nenhum.
-- =============================================================================

create table produtos (
  id                  uuid primary key default gen_random_uuid(),
  filial_id           uuid not null references filiais (id),
  codigo              text not null,
  descricao           text not null,
  valor_compra        numeric(10,2) not null default 0,
  valor_venda         numeric(10,2) not null default 0,
  quantidade_estoque  numeric(10,2) not null default 0,
  ativo               boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (filial_id, codigo)
);
comment on table produtos is 'Produtos à venda no balcão (não são serviço do pátio) — ver vendas_produtos.';

create trigger produtos_set_updated_at before update on produtos
  for each row execute function set_updated_at();

create table vendas_produtos (
  id               uuid primary key default gen_random_uuid(),
  filial_id        uuid not null references filiais (id),
  produto_id       uuid references produtos (id),
  quantidade       numeric(10,2) not null,
  valor_unitario   numeric(10,2) not null,
  valor_total      numeric(10,2) not null,
  forma_pagamento  text not null,                 -- codigo da forma (ver formas_pagamento)
  caixa_id         uuid references caixas (id),    -- caixa que recebeu, na hora da venda
  operador_id      uuid references perfis (id),
  criado_em        timestamptz not null default now()
);
comment on table vendas_produtos is
  'Venda avulsa de produto no balcão (ver Pátio → ⋮ → Venda Produtos). Soma no fechamento de caixa (Caixa.jsx) e no BI (BI.jsx), à parte de movimentos/notas_fiscais. NUNCA gera RPS/NFS-e — não é serviço de estacionamento.';
create index vendas_produtos_caixa_idx on vendas_produtos (caixa_id);
create index vendas_produtos_criado_idx on vendas_produtos (filial_id, criado_em);

alter table produtos enable row level security;
alter table vendas_produtos enable row level security;
do $$
declare t text;
begin
  foreach t in array array['produtos','vendas_produtos'] loop
    execute format('create policy %I_sel on %I for select to authenticated using (filial_id = filial_do_usuario())', t, t);
    execute format('create policy %I_ins on %I for insert to authenticated with check (filial_id = filial_do_usuario())', t, t);
    execute format('create policy %I_upd on %I for update to authenticated using (filial_id = filial_do_usuario()) with check (filial_id = filial_do_usuario())', t, t);
    execute format('create policy %I_del on %I for delete to authenticated using (filial_id = filial_do_usuario())', t, t);
  end loop;
end $$;
