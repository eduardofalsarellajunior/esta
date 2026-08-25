import { supabase } from './supabase.js';
import { fmtBRL, dataHoraDe } from './tempo.js';

const MENSALISTA = new Set(['I', 'P', 'H']);

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Carrega todos os dados de UM caixa (turno) — usado tanto pro relatório na
 * hora do fechamento quanto pra reimprimir um caixa já fechado há tempo (ver
 * histórico em Caixa.jsx). Cada consulta usa o `caixa_id` gravado na hora
 * certa (saída, antecipado, mensalidade, venda de produto, sangria — mesmo
 * esquema que Caixa.jsx já usa pro resumo ao vivo), então funciona igual pra
 * um turno de anos atrás.
 */
export async function carregarRelatorioCaixa(caixa) {
  const inicio = caixa.aberto_em;
  const fim = caixa.fechado_em || new Date().toISOString();

  const [
    { data: movs }, { data: sangrias }, { data: formas }, { data: mensPagtos },
    { data: antecipadosEntrada }, { data: antecipadosReserva }, { data: vendasProdutos },
    { data: operadorRow }, { data: convenios }, { data: tabelasPreco },
  ] = await Promise.all([
    supabase.from('movimentos').select('*').eq('caixa_id', caixa.id).not('dt_saida', 'is', null),
    supabase.from('sangrias').select('*').eq('caixa_id', caixa.id).order('created_at'),
    supabase.from('formas_pagamento').select('codigo,descricao,eh_dinheiro'),
    supabase.from('mensalista_pagamentos').select('*, mensalistas(razao)').eq('caixa_id', caixa.id).order('dt_pagamento'),
    supabase.from('movimento_pagamentos').select('*').eq('caixa_id', caixa.id),
    supabase.from('reservas').select('valor_antecipado, forma_antecipado, placa, nome').eq('caixa_id_antecipado', caixa.id),
    supabase.from('vendas_produtos').select('*, produtos(codigo,descricao)').eq('caixa_id', caixa.id).order('criado_em'),
    supabase.from('perfis').select('nome').eq('id', caixa.operador_id).maybeSingle(),
    supabase.from('convenios').select('codigo, razao'),
    supabase.from('tabelas_preco').select('tipo, descricao').order('vigencia_inicio', { ascending: false }),
  ]);

  const ids = (movs || []).map((m) => m.id);
  // Só pagamento de saída (caixa_id null) — o de antecipado já tem o próprio
  // caixa_id e entra à parte (`antecipadosEntrada` acima), senão contaria o
  // mesmo dinheiro duas vezes quando entrada e saída caem no mesmo turno.
  const { data: pagtosSaida } = ids.length
    ? await supabase.from('movimento_pagamentos').select('*').in('movimento_id', ids).is('caixa_id', null)
    : { data: [] };

  // Veículos ainda no pátio que ENTRARAM durante o turno — busca candidatos
  // pelo dia (dt_entrada) e refina pela hora exata (dt_entrada+hr_entrada
  // combinados num Date real), já que movimentos guarda isso em dois campos
  // separados, sem um timestamp único pra comparar direto com aberto_em/fechado_em.
  const diaIni = inicio.slice(0, 10);
  const diaFim = fim.slice(0, 10);
  const { data: candidatosAbertos } = await supabase.from('movimentos').select('dt_entrada, hr_entrada')
    .is('dt_saida', null).is('excluido_em', null)
    .gte('dt_entrada', diaIni).lte('dt_entrada', diaFim);
  const inicioDt = new Date(inicio);
  const fimDt = new Date(fim);
  const qtdSemSaida = (candidatosAbertos || []).filter((m) => {
    const dt = dataHoraDe(m.dt_entrada, Number(m.hr_entrada));
    return dt >= inicioDt && dt <= fimDt;
  }).length;

  // Veículos cancelados no turno — exclusão já tem timestamp próprio (excluido_em).
  const { count: qtdCancelados } = await supabase.from('movimentos')
    .select('id', { count: 'exact', head: true })
    .gte('excluido_em', inicio).lte('excluido_em', fim);

  const dinheiroCods = new Set((formas || []).filter((f) => f.eh_dinheiro).map((f) => f.codigo));
  const descForma = Object.fromEntries((formas || []).map((f) => [f.codigo, f.descricao]));
  const descConvenio = Object.fromEntries((convenios || []).map((c) => [c.codigo, c.razao]));
  const descTabela = {};
  for (const t of tabelasPreco || []) if (!descTabela[t.tipo]) descTabela[t.tipo] = t.descricao;

  let valorFaturado = 0, valorProporcionalTotal = 0;
  const porTipo = { avulso: 0, mensalista: 0 };
  const porConvenio = {};
  const porTabela = {};
  for (const m of movs || []) {
    valorFaturado += Number(m.valor || 0);
    valorProporcionalTotal += Number(m.valor_proporcional || 0);
    if (MENSALISTA.has(m.tipo_mens)) porTipo.mensalista++; else porTipo.avulso++;
    if (m.convenio_codigo) {
      const e = (porConvenio[m.convenio_codigo] ||= { qtd: 0, desconto: 0 });
      e.qtd++;
      e.desconto += Math.max(0, Number(m.valor_proporcional || 0) - Number(m.valor || 0));
    }
    const et = (porTabela[m.tipo_veic] ||= { qtd: 0, valor: 0 });
    et.qtd++;
    et.valor += Number(m.valor || 0);
  }
  const descontos = valorProporcionalTotal - valorFaturado;

  const mensalidades = (mensPagtos || []).map((p) => ({
    id: p.id, nome: p.mensalistas?.razao || '—', valor: Number(p.valor_pago || 0), forma: p.forma_pagamento,
  }));
  const mensalidadesTotal = mensalidades.reduce((s, p) => s + p.valor, 0);

  const produtos = (vendasProdutos || []).map((v) => ({
    id: v.id, nome: v.produtos ? `${v.produtos.codigo} — ${v.produtos.descricao}` : '—',
    quantidade: Number(v.quantidade || 0), valor: Number(v.valor_total || 0), forma: v.forma_pagamento,
  }));
  const produtosTotal = produtos.reduce((s, p) => s + p.valor, 0);

  const reservasAntecip = (antecipadosReserva || []).filter((r) => Number(r.valor_antecipado) > 0);
  const antecipados = [
    ...(antecipadosEntrada || []).map((p) => ({ id: p.id, ref: 'Entrada de veículo', valor: Number(p.valor || 0), forma: p.forma_pagamento })),
    ...reservasAntecip.map((r, i) => ({
      id: `reserva-${i}`, ref: `Reserva${r.placa ? ` ${r.placa}` : ''}${r.nome ? ` — ${r.nome}` : ''}`,
      valor: Number(r.valor_antecipado), forma: r.forma_antecipado,
    })),
  ];
  const antecipadosTotal = antecipados.reduce((s, a) => s + a.valor, 0);

  // Recebido por forma de pagamento — soma saída + mensalidade + antecipado + produto.
  const porForma = {};
  const somaForma = (forma, valor) => { porForma[forma] = (porForma[forma] || 0) + valor; };
  for (const p of pagtosSaida || []) somaForma(p.forma_pagamento, Number(p.valor || 0));
  for (const m of mensalidades) somaForma(m.forma, m.valor);
  for (const a of antecipados) somaForma(a.forma, a.valor);
  for (const p of produtos) somaForma(p.forma, p.valor);

  const dinheiro = (pagtosSaida || []).filter((p) => dinheiroCods.has(p.forma_pagamento)).reduce((s, p) => s + Number(p.valor || 0), 0)
    + mensalidades.filter((m) => dinheiroCods.has(m.forma)).reduce((s, m) => s + m.valor, 0)
    + antecipados.filter((a) => dinheiroCods.has(a.forma)).reduce((s, a) => s + a.valor, 0)
    + produtos.filter((p) => dinheiroCods.has(p.forma)).reduce((s, p) => s + p.valor, 0);

  const sangriasLista = (sangrias || []).map((s) => ({ id: s.id, valor: Number(s.valor || 0), motivo: s.motivo || '' }));
  const sangriasTotal = sangriasLista.reduce((s, x) => s + x.valor, 0);

  const totalRecebido = valorFaturado + mensalidadesTotal + antecipadosTotal + produtosTotal;
  const esperadoCaixa = Number(caixa.valor_abertura || 0) + dinheiro - sangriasTotal;
  const diferenca = caixa.valor_fechamento != null ? Number(caixa.valor_fechamento) - esperadoCaixa : null;

  return {
    caixa, operador: operadorRow?.nome || '—',
    porTipo, porConvenio, porTabela, descConvenio, descTabela, descForma,
    valorFaturado, valorProporcionalTotal, descontos,
    mensalidades, mensalidadesTotal, produtos, produtosTotal, antecipados, antecipadosTotal,
    porForma, dinheiro, sangrias: sangriasLista, sangriasTotal,
    totalRecebido, esperadoCaixa, diferenca,
    qtdSaidas: (movs || []).length, qtdCancelados: qtdCancelados || 0, qtdSemSaida,
  };
}

/** Uma linha "rótulo .... valor" — o jeito padrão de comprovante de bobina. */
function linha(rotulo, valor, opts = '') {
  return `<div class="linha ${opts}"><span>${escapeHtml(rotulo)}</span><strong>${escapeHtml(valor)}</strong></div>`;
}
function secao(titulo) {
  return `<div class="secao">${escapeHtml(titulo)}</div>`;
}

/**
 * Relatório de fechamento de caixa, impresso na bobina de 58mm (mesmo padrão
 * de Ticket.jsx — ver comentário lá sobre @page/58mm) — é um comprovante,
 * não um relatório A4 como BI/Reservas.
 */
export function imprimirRelatorioCaixa(dados, filial) {
  const { caixa } = dados;
  const cabecalho = filial && (filial.nome_fantasia || filial.cnpj) ? `
    ${filial.nome_fantasia ? `<div class="nome">${escapeHtml(filial.nome_fantasia)}</div>` : ''}
    ${filial.cnpj ? `<div class="linha-end">CNPJ: ${escapeHtml(filial.cnpj)}</div>` : ''}
    <hr>` : '';

  const veiculos = secao('Veículos')
    + linha('Saídas no turno', String(dados.qtdSaidas))
    + linha('  Avulso', String(dados.porTipo.avulso))
    + linha('  Mensalista', String(dados.porTipo.mensalista))
    + linha('Cancelados', String(dados.qtdCancelados))
    + linha('Sem saída (no pátio)', String(dados.qtdSemSaida));

  const faturamento = secao('Faturamento')
    + linha('Valor faturado', fmtBRL(dados.valorFaturado))
    + linha('Descontos (convênio)', fmtBRL(dados.descontos))
    + linha('Mensalidades', fmtBRL(dados.mensalidadesTotal))
    + linha('Antecipados', fmtBRL(dados.antecipadosTotal))
    + linha('Venda de produtos', fmtBRL(dados.produtosTotal))
    + linha('Total recebido', fmtBRL(dados.totalRecebido), 'total');

  const caixaSecao = secao('Caixa')
    + linha('Troco de abertura', fmtBRL(Number(caixa.valor_abertura || 0)))
    + linha('Sangrias', fmtBRL(dados.sangriasTotal))
    + (dados.sangrias.length
      ? dados.sangrias.map((s) => linha(`  ${s.motivo || 'Sangria'}`, `-${fmtBRL(s.valor)}`)).join('')
      : '')
    + linha('Dinheiro recebido', fmtBRL(dados.dinheiro))
    + linha('Esperado no caixa', fmtBRL(dados.esperadoCaixa), 'total')
    + (caixa.valor_fechamento != null ? linha('Dinheiro contado', fmtBRL(Number(caixa.valor_fechamento))) : '')
    + (dados.diferenca != null
      ? linha('Diferença', `${dados.diferenca >= 0 ? '+' : ''}${fmtBRL(dados.diferenca)}`, Math.abs(dados.diferenca) < 0.005 ? '' : 'destaque')
      : '');

  const formasHtml = secao('Formas de pagamento')
    + (Object.entries(dados.porForma).length
      ? Object.entries(dados.porForma).map(([k, v]) => linha(dados.descForma[k] || k, fmtBRL(v))).join('')
      : linha('Sem recebimentos', '—'));

  const conveniosHtml = Object.keys(dados.porConvenio).length ? (
    secao('Convênios')
    + Object.entries(dados.porConvenio)
      .map(([k, v]) => linha(`${dados.descConvenio[k] || k} (${v.qtd})`, fmtBRL(v.desconto)))
      .join('')
  ) : '';

  const tabelasHtml = Object.keys(dados.porTabela).length ? (
    secao('Tabelas de preço')
    + Object.entries(dados.porTabela)
      .map(([k, v]) => linha(`${dados.descTabela[k] || k} (${v.qtd})`, fmtBRL(v.valor)))
      .join('')
  ) : '';

  const mensalidadesHtml = dados.mensalidades.length ? (
    secao(`Mensalidades recebidas (${dados.mensalidades.length})`)
    + dados.mensalidades.map((m) => linha(m.nome, fmtBRL(m.valor))).join('')
  ) : '';

  const produtosHtml = dados.produtos.length ? (
    secao(`Vendas de produtos (${dados.produtos.length})`)
    + dados.produtos.map((p) => linha(`${p.nome} (${p.quantidade}x)`, fmtBRL(p.valor))).join('')
  ) : '';

  const antecipadosHtml = dados.antecipados.length ? (
    secao(`Antecipados (${dados.antecipados.length})`)
    + dados.antecipados.map((a) => linha(a.ref, fmtBRL(a.valor))).join('')
  ) : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Fechamento de caixa Nº ${escapeHtml(caixa.numero)}</title>
    <style>
      @page { size: 58mm auto; margin: 0; }
      body { font-family: system-ui, Arial, sans-serif; color: #000; margin: 0; padding: 2mm 3mm; box-sizing: border-box; }
      .nome { font-size: 16px; font-weight: 800; margin-bottom: 2px; }
      .linha-end { font-size: 11px; color: #333; margin-bottom: 2px; }
      hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
      h1 { font-size: 14px; margin: 0 0 2px; text-align: center; }
      .numero { font-size: 16px; font-weight: 800; text-align: center; margin: 4px 0; }
      .periodo { font-size: 11px; text-align: center; color: #333; margin-bottom: 6px; }
      .secao { font-size: 11px; font-weight: 800; text-transform: uppercase; margin: 10px 0 3px; border-bottom: 1px dashed #999; padding-bottom: 2px; }
      .linha { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; margin: 2px 0; }
      .linha span { flex: 1; }
      .linha strong { font-weight: 600; white-space: nowrap; }
      .linha.total { font-weight: 800; border-top: 1px dashed #999; padding-top: 3px; margin-top: 4px; }
      .linha.destaque strong { color: #b30000; }
      .rodape { font-size: 11px; color: #333; margin-top: 10px; }
    </style></head><body>
      ${cabecalho}
      <h1>Fechamento de Caixa</h1>
      <div class="numero">Nº ${escapeHtml(caixa.numero)}</div>
      <div class="periodo">
        De: ${new Date(caixa.aberto_em).toLocaleString('pt-BR')}<br>
        Até: ${caixa.fechado_em ? new Date(caixa.fechado_em).toLocaleString('pt-BR') : 'em aberto'}
      </div>
      ${veiculos}
      ${faturamento}
      ${caixaSecao}
      ${formasHtml}
      ${conveniosHtml}
      ${tabelasHtml}
      ${mensalidadesHtml}
      ${produtosHtml}
      ${antecipadosHtml}
      <div class="rodape">
        Operador: ${escapeHtml(dados.operador)}<br>
        Impresso em ${new Date().toLocaleString('pt-BR')}
      </div>
    </body></html>`;
  const win = window.open('', '_blank', 'width=380,height=600');
  if (!win) { window.alert('Permita pop-ups para imprimir o relatório.'); return; }
  win.document.write(html);
  win.document.close();
  win.onafterprint = () => win.close();
  win.focus();
  win.print();
}
