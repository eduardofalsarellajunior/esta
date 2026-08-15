import { supabase } from './supabase.js';
import { fmtDataBR, fmtBRL } from './tempo.js';
import { carregarModelosTicket } from './dados.js';
import { dadosFilial, dadosMensalista, dadosMensalidade } from './dadosTicket.js';

// Grava o evento de recebimento (mensalista_pagamentos), liga ao caixa aberto
// do operador (se houver, pra entrar no fechamento) e avança o próximo
// pagamento no cadastro do mensalista. Compartilhado entre a tela de
// Mensalistas e o recebimento rápido do Pátio.
export async function receberMensalidade({ perfil, mensalista, dtPagamento, valor, forma, proximo, observacao }) {
  const { data: cx } = await supabase.from('caixas').select('id')
    .eq('operador_id', perfil.id).eq('status', 'aberto').maybeSingle();
  const { data: pagamento, error: errPag } = await supabase.from('mensalista_pagamentos').insert({
    filial_id: perfil.filial_id, mensalista_id: mensalista.id,
    dt_pagamento: dtPagamento, valor_pago: Number(valor), forma_pagamento: forma,
    proximo_pagamento: proximo, proximo_anterior: mensalista.proximo_pagamento || null,
    observacao: observacao?.trim() || null, recebido_por: perfil.id,
    caixa_id: cx?.id ?? null,
  }).select().single();
  if (errPag) return { error: errPag.message };

  const { error: errCad } = await supabase.from('mensalistas')
    .update({ proximo_pagamento: proximo }).eq('id', mensalista.id);
  if (errCad) return { error: `Pagamento gravado, mas o cadastro não foi atualizado: ${errCad.message}`, pagamento };

  return { error: null, pagamento };
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

/**
 * Mesmo recibo, já com o layout que a filial cadastrou em Modelos de ticket
 * (tipo `mensalidade`). É async porque precisa buscar filial, veículos e o
 * modelo; qualquer problema aí só faz o recibo sair no layout fixo de sempre.
 *
 * `dados`+`tipo` sempre são anexados, mesmo sem modelo próprio cadastrado —
 * é o que permite imprimir esse recibo por Bluetooth/ESC-POS (que usa o
 * modelo padrão de fábrica como último recurso, ver src/lib/escpos.js).
 */
export async function ticketRecebimentoComModelo(args) {
  const base = ticketRecebimento(args);
  try {
    const { mensalista, dtPagamento, valor, proximo, formaDescricao, operador, recibo } = args;
    const [modelos, fl, vc] = await Promise.all([
      carregarModelosTicket(),
      supabase.from('filiais').select('*').eq('id', mensalista.filial_id).maybeSingle(),
      supabase.from('mensalista_veiculos').select('placa, modelo').eq('mensalista_id', mensalista.id),
    ]);
    return {
      ...base,
      tipo: 'mensalidade',
      ...(modelos.mensalidade ? { modelo: modelos.mensalidade } : {}),
      dados: {
        ...dadosFilial(fl.data || {}),
        ...dadosMensalista({ mensalista, veiculos: vc.data || [] }),
        ...dadosMensalidade({
          dtPagamento, proximo, valor, formaDescricao,
          valorMensalidade: mensalista.valor_mensalidade,
        }),
        'C#': recibo ? String(recibo).slice(0, 8).toUpperCase() : '',
        US: operador || '',
      },
    };
  } catch {
    return base;
  }
}
