import { supabase } from './supabase.js';
import { fmtDataBR, fmtBRL } from './tempo.js';

// Grava o evento de recebimento (mensalista_pagamentos), liga ao caixa aberto
// do operador (se houver, pra entrar no fechamento) e avança o próximo
// pagamento no cadastro do mensalista. Compartilhado entre a tela de
// Mensalistas e o recebimento rápido do Pátio.
export async function receberMensalidade({ perfil, mensalista, dtPagamento, valor, forma, proximo, observacao }) {
  const { data: cx } = await supabase.from('caixas').select('id')
    .eq('operador_id', perfil.id).eq('status', 'aberto').maybeSingle();
  const { error: errPag } = await supabase.from('mensalista_pagamentos').insert({
    filial_id: perfil.filial_id, mensalista_id: mensalista.id,
    dt_pagamento: dtPagamento, valor_pago: Number(valor), forma_pagamento: forma,
    proximo_pagamento: proximo, proximo_anterior: mensalista.proximo_pagamento || null,
    observacao: observacao?.trim() || null, recebido_por: perfil.id,
    caixa_id: cx?.id ?? null,
  });
  if (errPag) return { error: errPag.message };

  const { error: errCad } = await supabase.from('mensalistas')
    .update({ proximo_pagamento: proximo }).eq('id', mensalista.id);
  if (errCad) return { error: `Pagamento gravado, mas o cadastro não foi atualizado: ${errCad.message}` };

  return { error: null };
}

export function descricaoForma(formas, codigo) {
  return formas.find((f) => f.codigo === codigo)?.descricao || codigo;
}

export function ticketRecebimento({ mensalista, dtPagamento, valor, proximo, formaDescricao, operador, reimpressao }) {
  return {
    titulo: reimpressao ? 'Recibo de mensalidade (reimpressão)' : 'Recibo de mensalidade',
    linhas: [
      ['Mensalista', mensalista.razao],
      ['Data do pagamento', fmtDataBR(dtPagamento)],
      ['Valor pago', fmtBRL(Number(valor))],
      ['Forma de pagamento', formaDescricao],
      ['Próximo pagamento', fmtDataBR(proximo)],
      [reimpressao ? 'Reimpresso por' : 'Operador', operador],
    ],
  };
}
