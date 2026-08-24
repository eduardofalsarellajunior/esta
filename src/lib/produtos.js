import { supabase } from './supabase.js';

/**
 * Venda avulsa de produto (balcão) — mesmo espírito de mensalidade.js/
 * receberMensalidade: liga ao caixa aberto do momento (sem caixa aberto
 * funciona igual, só fica fora do fechamento — ver Caixa.jsx) e desconta do
 * estoque. NUNCA gera RPS/NFS-e — venda de produto não é serviço do pátio
 * (ver Fiscal.jsx/notaFiscal.js); esta função não toca em notas_fiscais.
 */
export async function venderProduto({ perfil, produto, quantidade, forma }) {
  const qtd = Number(quantidade);
  const valorUnitario = Number(produto.valor_venda || 0);
  const valorTotal = Math.round(qtd * valorUnitario * 100) / 100;
  const { data: cx } = await supabase.from('caixas').select('id')
    .eq('operador_id', perfil.id).eq('status', 'aberto').maybeSingle();
  const { data: venda, error } = await supabase.from('vendas_produtos').insert({
    filial_id: perfil.filial_id, produto_id: produto.id,
    quantidade: qtd, valor_unitario: valorUnitario, valor_total: valorTotal,
    forma_pagamento: forma, caixa_id: cx?.id ?? null, operador_id: perfil.id,
  }).select().single();
  if (error) return { error: error.message };

  const { error: errEstoque } = await supabase.from('produtos')
    .update({ quantidade_estoque: Number(produto.quantidade_estoque || 0) - qtd })
    .eq('id', produto.id);
  if (errEstoque) return { error: `Venda gravada, mas o estoque não foi atualizado: ${errEstoque.message}`, venda };

  return { error: null, venda };
}
