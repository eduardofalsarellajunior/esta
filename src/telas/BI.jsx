import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { hojeISO, dataDeISO, dataHoraDe, limitesDiaLocal, fmtBRL, fmtHora, fmtDataBR } from '../lib/tempo.js';
import { horas, minuto, minutosParaHHMM } from '../../packages/tarifacao/tarifacao.ts';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Impressão numa janela dedicada (mesmo padrão do ticket de entrada/saída).
// `veiculosDetalhe` vem null quando o checkbox "Ver veículos" está desmarcado.
function imprimirRelatorio(dados, de, ate, filial, veiculosDetalhe) {
  const cabecalho = filial && (filial.nome_fantasia || filial.endereco || filial.cnpj) ? `
    ${filial.nome_fantasia ? `<div class="nome">${escapeHtml(filial.nome_fantasia)}</div>` : ''}
    ${filial.endereco ? `<div class="linha-end">${escapeHtml(filial.endereco)}</div>` : ''}
    ${filial.cnpj ? `<div class="linha-end">CNPJ: ${escapeHtml(filial.cnpj)}</div>` : ''}
    <hr>` : '';

  const kpis = [
    ['Saídas', dados.totalVeic],
    ['Avulso', fmtBRL(dados.valorAvulso)],
    ['Serviços', fmtBRL(dados.valorServicos)],
    ['Descontos (conv.)', fmtBRL(dados.descontos)],
    ['Tempo médio', fmtHora(dados.tempoMedio)],
    ['Mensalidades recebidas', `${dados.mensalidades.length} · ${fmtBRL(dados.mensalidadesTotal)}`],
    ['Faturado (avulso + convênio + serviços + mensalidades)', fmtBRL(dados.faturado)],
  ].map(([r, v]) => `<p><strong>${escapeHtml(r)}:</strong> ${escapeHtml(v)}</p>`).join('');

  const porTipo = Object.entries(dados.porTipo)
    .map(([k, v]) => `<tr><td>${escapeHtml(rotuloTipo(k))}</td><td style="text-align:right">${v}</td></tr>`).join('');
  const porForma = Object.entries(dados.recebidoPorForma)
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td style="text-align:right">${escapeHtml(fmtBRL(v))}</td></tr>`).join('');
  const porTipoCancelado = Object.entries(dados.porTipoCancelado)
    .map(([k, v]) => `<tr><td>${escapeHtml(rotuloTipo(k))}</td><td style="text-align:right">${v}</td></tr>`).join('');

  const mensalidadesHtml = `
      <h2>Mensalidades recebidas (${dados.mensalidades.length})</h2>
      <table><thead><tr>
        <th>Pagamento</th><th>Mensalista</th><th>Forma</th><th>Próximo</th><th>Valor</th>
      </tr></thead><tbody>${dados.mensalidades.map((p) => `<tr>
        <td>${escapeHtml(fmtDataBR(p.dt_pagamento))}</td>
        <td>${escapeHtml(p.mensalista)}</td>
        <td>${escapeHtml(p.forma)}</td>
        <td>${escapeHtml(fmtDataBR(p.proximo_pagamento))}</td>
        <td style="text-align:right">${escapeHtml(fmtBRL(p.valor))}</td>
      </tr>`).join('') || '<tr><td colspan="5">Nenhuma mensalidade recebida no período.</td></tr>'}</tbody>
      ${dados.mensalidades.length ? `<tfoot><tr><td colspan="4"><strong>Total</strong></td><td style="text-align:right"><strong>${escapeHtml(fmtBRL(dados.mensalidadesTotal))}</strong></td></tr></tfoot>` : ''}
      </table>`;

  const veiculosHtml = veiculosDetalhe != null ? `
      <h2>Veículos (${veiculosDetalhe.length})</h2>
      <table><thead><tr>
        <th>Placa</th><th>Carro</th><th>Tabela</th><th>Entrada</th><th>Saída</th><th>Tempo</th><th>Pagto</th><th>Valor</th><th>Desc. conv.</th><th>Status</th>
      </tr></thead><tbody>${veiculosDetalhe.map((v) => `<tr>
        <td>${escapeHtml(v.placa)}</td>
        <td>${escapeHtml(v.modelo || '—')}</td>
        <td>${escapeHtml(v.tipo_veic)}</td>
        <td>${escapeHtml(v.dt_entrada.split('-').reverse().join('/'))} ${escapeHtml(fmtHora(Number(v.hr_entrada)))}</td>
        <td>${v.cancelado ? '—' : `${escapeHtml(v.dt_saida.split('-').reverse().join('/'))} ${escapeHtml(fmtHora(Number(v.hr_saida)))}`}</td>
        <td>${v.tempo != null ? escapeHtml(fmtHora(v.tempo)) : '—'}</td>
        <td>${escapeHtml(v.pagamento)}</td>
        <td>${v.cancelado ? '—' : escapeHtml(fmtBRL(v.valor) + (v.valorCalculado != null ? ' *' : ''))}</td>
        <td>${v.cancelado || !v.descontoConvenio ? '—' : escapeHtml(fmtBRL(v.descontoConvenio))}</td>
        <td>${v.cancelado ? '<strong>Cancelado</strong>' : ''}</td>
      </tr>`).join('') || '<tr><td colspan="10">Nenhum veículo no período.</td></tr>'}</tbody></table>${
        veiculosDetalhe.some((v) => v.valorCalculado != null)
          ? '<p style="font-size:11px">* valor alterado na saída (diferente do calculado pela tabela).</p>' : ''
      }` : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relatório BI</title>
    <style>
      body { font-family: system-ui, Arial, sans-serif; color: #000; padding: 20px; max-width: 640px; }
      .nome { font-size: 18px; font-weight: 800; margin-bottom: 2px; }
      .linha-end { font-size: 12px; color: #333; margin-bottom: 2px; }
      hr { border: none; border-top: 1px dashed #999; margin: 12px 0; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      h2 { font-size: 14px; margin: 16px 0 6px; }
      p { font-size: 13px; margin: 3px 0; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { text-align: left; padding: 4px 6px 4px 0; border-bottom: 1px solid #999; }
      td { padding: 4px 6px 4px 0; border-bottom: 1px solid #ddd; }
    </style></head><body>
      ${cabecalho}
      <h1>Painel / BI</h1>
      <p class="linha-end">Período: ${escapeHtml(de.split('-').reverse().join('/'))} a ${escapeHtml(ate.split('-').reverse().join('/'))}</p>
      ${kpis}
      <h2>Por tipo</h2>
      <table><tbody>${porTipo || '<tr><td>—</td></tr>'}</tbody></table>
      <h2>Cancelados por tipo</h2>
      <table><tbody>${porTipoCancelado || '<tr><td>Nenhum cancelamento no período.</td></tr>'}</tbody></table>
      <h2>Por forma de pagamento</h2>
      <table><tbody>${porForma || '<tr><td>Sem pagamentos no período.</td></tr>'}</tbody></table>
      ${mensalidadesHtml}
      ${veiculosHtml}
    </body></html>`;
  const win = window.open('', '_blank', 'width=420,height=650');
  if (!win) { window.alert('Permita pop-ups para imprimir o relatório.'); return; }
  win.document.write(html);
  win.document.close();
  win.onafterprint = () => win.close();
  win.focus();
  win.print();
}

// Versão em texto simples (sem HTML) do mesmo relatório, pra WhatsApp/Email.
function textoRelatorio(dados, de, ate, filial) {
  const linhas = [];
  if (filial?.nome_fantasia) linhas.push(filial.nome_fantasia);
  if (filial?.endereco) linhas.push(filial.endereco);
  if (filial?.cnpj) linhas.push(`CNPJ: ${filial.cnpj}`);
  if (linhas.length) linhas.push('');
  linhas.push('Painel / BI');
  linhas.push(`Período: ${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`);
  linhas.push('');
  linhas.push(`Saídas: ${dados.totalVeic}`);
  linhas.push(`Avulso: ${fmtBRL(dados.valorAvulso)}`);
  linhas.push(`Serviços: ${fmtBRL(dados.valorServicos)}`);
  linhas.push(`Descontos (conv.): ${fmtBRL(dados.descontos)}`);
  linhas.push(`Tempo médio: ${fmtHora(dados.tempoMedio)}`);
  linhas.push('');
  linhas.push('Por tipo:');
  for (const [k, v] of Object.entries(dados.porTipo)) linhas.push(`  ${rotuloTipo(k)}: ${v}`);
  linhas.push('');
  linhas.push('Cancelados por tipo:');
  const cancelados = Object.entries(dados.porTipoCancelado);
  if (cancelados.length) for (const [k, v] of cancelados) linhas.push(`  ${rotuloTipo(k)}: ${v}`);
  else linhas.push('  Nenhum cancelamento no período.');
  linhas.push('');
  linhas.push('Recebido por forma de pagamento:');
  const formas = Object.entries(dados.recebidoPorForma);
  if (formas.length) for (const [k, v] of formas) linhas.push(`  ${k}: ${fmtBRL(v)}`);
  else linhas.push('  Sem pagamentos no período.');
  linhas.push('');
  linhas.push(`Mensalidades recebidas: ${dados.mensalidades.length} · ${fmtBRL(dados.mensalidadesTotal)}`);
  for (const p of dados.mensalidades) {
    linhas.push(`  ${fmtDataBR(p.dt_pagamento)} — ${p.mensalista}: ${fmtBRL(p.valor)} (${p.forma}) · próx. ${fmtDataBR(p.proximo_pagamento)}`);
  }
  if (!dados.mensalidades.length) linhas.push('  Nenhuma mensalidade recebida no período.');
  linhas.push('');
  linhas.push(`Faturado (avulso + convênio + serviços + mensalidades): ${fmtBRL(dados.faturado)}`);
  return linhas.join('\n');
}

function linkWhatsAppRelatorio(texto) {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

function linkEmailRelatorio(texto, de, ate) {
  const assunto = `Relatório BI — ${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`;
  return `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;
}

const MENSALISTA = new Set(['I', 'P', 'H']);

export default function BI({ perfil }) {
  const [de, setDe] = useState(hojeISO());
  const [ate, setAte] = useState(hojeISO());
  const [dados, setDados] = useState(null);
  const [veiculos, setVeiculos] = useState([]);
  const [verVeiculos, setVerVeiculos] = useState(false);
  const [filial, setFilial] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    supabase.from('filiais').select('nome_fantasia, endereco, cnpj').eq('id', perfil.filial_id).maybeSingle()
      .then(({ data }) => setFilial(data));
  }, [perfil.filial_id]);

  const carregar = useCallback(async () => {
    setErro('');
    const { data: movs, error } = await supabase.from('movimentos').select('*')
      .gte('dt_saida', de).lte('dt_saida', ate).not('dt_saida', 'is', null);
    if (error) { setErro(error.message); return; }
    const { inicio, fim } = limitesDiaLocal(de, ate);
    const { data: cancelados, error: errCanc } = await supabase.from('movimentos').select('*')
      .gte('excluido_em', inicio).lt('excluido_em', fim);
    if (errCanc) { setErro(errCanc.message); return; }
    const ids = movs.map((m) => m.id);
    let pagtos = [];
    let movsComServico = new Set();
    if (ids.length) {
      const { data } = await supabase.from('movimento_pagamentos').select('*').in('movimento_id', ids);
      pagtos = data || [];
      // Serviço sempre substitui a tabela do veículo (nunca soma às duas —
      // ver Patio.jsx), então "quanto veio de serviço" é o valor inteiro dos
      // movimentos com pelo menos um serviço marcado, não uma fração.
      const { data: ms } = await supabase.from('movimento_servicos').select('movimento_id').in('movimento_id', ids);
      movsComServico = new Set((ms || []).map((r) => r.movimento_id));
    }
    const { data: formas } = await supabase.from('formas_pagamento').select('codigo,descricao');
    const descForma = Object.fromEntries((formas || []).map((f) => [f.codigo, f.descricao]));

    // Recebimentos de mensalidade no período (evento gravado no cadastro do mensalista).
    const { data: mensPagtos, error: errMens } = await supabase.from('mensalista_pagamentos')
      .select('*, mensalistas(razao)')
      .gte('dt_pagamento', de).lte('dt_pagamento', ate)
      .order('dt_pagamento', { ascending: false });
    if (errMens) { setErro(errMens.message); return; }

    const porTipo = {};
    let recebidoSaidas = 0, tabelaCheia = 0, valorServicos = 0, valorAvulso = 0, minutosTotal = 0, saidasComTempo = 0;
    for (const m of movs) {
      porTipo[m.tipo_mens] = (porTipo[m.tipo_mens] || 0) + 1;
      recebidoSaidas += Number(m.valor || 0);
      tabelaCheia += Number(m.valor_proporcional || 0);
      if (movsComServico.has(m.id)) valorServicos += Number(m.valor || 0);
      // Avulso: o carro que passa pela balança normal (com convênio ou sem —
      // convênio é só um desconto em cima do avulso, não outra categoria).
      // Fora daqui: mensalista/pacote/hóspede (0 nesta fase) e serviço (soma
      // à parte, sempre substitui a tabela do veículo — ver Patio.jsx).
      else if (!MENSALISTA.has(m.tipo_mens)) valorAvulso += Number(m.valor || 0);
      if (m.hr_saida != null && m.hr_entrada != null) {
        const decorrido = horas({
          dtEntrada: dataDeISO(m.dt_entrada), entrada: Number(m.hr_entrada),
          dtSaida: dataDeISO(m.dt_saida), saida: Number(m.hr_saida),
        });
        minutosTotal += minuto(decorrido);
        saidasComTempo++;
      }
    }
    const porForma = {};
    const pagtosPorMov = {};
    for (const p of pagtos) {
      const k = descForma[p.forma_pagamento] || p.forma_pagamento;
      porForma[k] = (porForma[k] || 0) + Number(p.valor || 0);
      (pagtosPorMov[p.movimento_id] ||= []).push(k);
    }
    const porTipoCancelado = {};
    for (const m of cancelados || []) {
      porTipoCancelado[m.tipo_mens] = (porTipoCancelado[m.tipo_mens] || 0) + 1;
    }
    const mensalidades = (mensPagtos || []).map((p) => ({
      id: p.id, dt_pagamento: p.dt_pagamento, proximo_pagamento: p.proximo_pagamento,
      mensalista: p.mensalistas?.razao || '—', valor: Number(p.valor_pago || 0),
      forma: descForma[p.forma_pagamento] || p.forma_pagamento,
    }));
    const mensalidadesTotal = mensalidades.reduce((s, p) => s + p.valor, 0);

    // Recebido por forma de pagamento, somando saídas (avulso+convênio+
    // serviço, via movimento_pagamentos) e mensalidades juntos — é o mesmo
    // "soma tudo" do KPI Faturado, só que quebrado por forma.
    const recebidoPorForma = { ...porForma };
    for (const p of mensalidades) recebidoPorForma[p.forma] = (recebidoPorForma[p.forma] || 0) + p.valor;

    // "Descontos (conv.)" é o quanto o convênio tirou do valor cheio da
    // tabela — informativo, não entra direto nos KPIs de Avulso/Faturado.
    const descontos = tabelaCheia - recebidoSaidas;
    setDados({
      totalVeic: movs.length, valorAvulso, faturado: recebidoSaidas + mensalidadesTotal,
      recebidoSaidas, descontos, valorServicos,
      porTipo, porTipoCancelado, recebidoPorForma,
      tempoMedio: saidasComTempo ? minutosParaHHMM(Math.round(minutosTotal / saidasComTempo)) : 0,
      mensalidades, mensalidadesTotal,
    });

    const detalheNormal = movs.map((m) => ({
      id: m.id, placa: m.placa, modelo: m.modelo, tipo_veic: m.tipo_veic,
      dt_entrada: m.dt_entrada, hr_entrada: m.hr_entrada, dt_saida: m.dt_saida, hr_saida: m.hr_saida,
      valor: Number(m.valor || 0),
      // Desconto de convênio desta saída (0 quando não teve convênio, ou
      // quando o operador alterou o valor manualmente — ver valorCalculado).
      descontoConvenio: Math.max(0, Number(m.valor_proporcional || 0) - Number(m.valor || 0)),
      // Null quando o valor cobrado é o que o motor calculou; preenchido com o
      // valor original quando o operador alterou na saída (vira "*" na lista).
      valorCalculado: m.valor_calculado != null ? Number(m.valor_calculado) : null,
      tempo: (m.hr_saida != null && m.hr_entrada != null) ? horas({
        dtEntrada: dataDeISO(m.dt_entrada), entrada: Number(m.hr_entrada),
        dtSaida: dataDeISO(m.dt_saida), saida: Number(m.hr_saida),
      }) : null,
      pagamento: pagtosPorMov[m.id]?.join(' + ') || (MENSALISTA.has(m.tipo_mens) ? 'Mensalista/hóspede' : '—'),
      cancelado: false,
      _quando: dataHoraDe(m.dt_saida, Number(m.hr_saida)).getTime(),
    }));
    const detalheCancelados = (cancelados || []).map((m) => ({
      id: m.id, placa: m.placa, modelo: m.modelo, tipo_veic: m.tipo_veic,
      dt_entrada: m.dt_entrada, hr_entrada: m.hr_entrada, dt_saida: null, hr_saida: null,
      valor: 0, tempo: null, pagamento: '—',
      cancelado: true,
      _quando: new Date(m.excluido_em).getTime(),
    }));
    const detalhe = [...detalheNormal, ...detalheCancelados].sort((a, b) => b._quando - a._quando);
    setVeiculos(detalhe);
  }, [de, ate]);

  useEffect(() => { carregar(); const t = setInterval(carregar, 30000); return () => clearInterval(t); }, [carregar]);

  return (
    <>
      <div className="card">
        <h2>Painel / BI</h2>
        <div className="linha-form" style={{ marginBottom: 10 }}>
          <div className="campo"><label>De</label><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
          <div className="campo"><label>Até</label><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          <label className="campo-check"><input type="checkbox" checked={verVeiculos} onChange={(e) => setVerVeiculos(e.target.checked)} /> Ver veículos</label>
          <button className="btn-ghost" onClick={carregar}>Atualizar</button>
          <button className="btn-ghost" disabled={!dados}
            onClick={() => window.open(linkWhatsAppRelatorio(textoRelatorio(dados, de, ate, filial)), '_blank')}>
            WhatsApp
          </button>
          <button className="btn-ghost" disabled={!dados}
            onClick={() => { window.location.href = linkEmailRelatorio(textoRelatorio(dados, de, ate, filial), de, ate); }}>
            Email
          </button>
          <button className="btn-primary" disabled={!dados}
            onClick={() => imprimirRelatorio(dados, de, ate, filial, verVeiculos ? veiculos : null)}>
            Imprimir
          </button>
        </div>
        <p className="suave">Indicadores em tempo real (atualiza a cada 30s).</p>
        {erro && <div className="aviso">{erro}</div>}
      </div>

      {dados && (
        <>
          <div className="kpis">
            <Kpi rotulo="Saídas" valor={dados.totalVeic} />
            <Kpi rotulo="Avulso" valor={fmtBRL(dados.valorAvulso)} />
            <Kpi rotulo="Serviços" valor={fmtBRL(dados.valorServicos)} />
            <Kpi rotulo="Descontos (conv.)" valor={fmtBRL(dados.descontos)} />
            <Kpi rotulo="Tempo médio" valor={fmtHora(dados.tempoMedio)} />
            <Kpi rotulo="Mensalidades" valor={fmtBRL(dados.mensalidadesTotal)} />
            <Kpi rotulo="Faturado" valor={fmtBRL(dados.faturado)} destaque />
          </div>
          <p className="suave" style={{ marginTop: -4 }}>
            Faturado = avulso + convênio + serviços + mensalidades (tudo somado). Avulso já inclui o desconto do convênio.
          </p>

          <div className="card">
            <h2>Por tipo</h2>
            <table><tbody>
              {Object.entries(dados.porTipo).map(([k, v]) => (
                <tr key={k}><td>{rotuloTipo(k)}</td><td style={{ textAlign: 'right' }}>{v}</td></tr>
              ))}
            </tbody></table>
          </div>

          <div className="card">
            <h2>Cancelados por tipo</h2>
            <table><tbody>
              {Object.entries(dados.porTipoCancelado).map(([k, v]) => (
                <tr key={k}><td>{rotuloTipo(k)}</td><td style={{ textAlign: 'right' }}>{v}</td></tr>
              ))}
              {Object.keys(dados.porTipoCancelado).length === 0 && <tr><td className="suave">Nenhum cancelamento no período.</td></tr>}
            </tbody></table>
          </div>

          <div className="card">
            <h2>Recebido por forma de pagamento</h2>
            <p className="suave">Saídas (avulso, convênio, serviços) + mensalidades, somados por forma.</p>
            <table><tbody>
              {Object.entries(dados.recebidoPorForma).map(([k, v]) => (
                <tr key={k}><td>{k}</td><td style={{ textAlign: 'right' }}>{fmtBRL(v)}</td></tr>
              ))}
              {Object.keys(dados.recebidoPorForma).length === 0 && <tr><td className="suave">Sem pagamentos no período.</td></tr>}
            </tbody></table>
          </div>

          <div className="card">
            <h2>Mensalidades recebidas ({dados.mensalidades.length})</h2>
            <p className="suave">Recebimentos lançados no cadastro do mensalista (botão Receber).</p>
            <div className="tabela-scroll">
              <table>
                <thead><tr><th>Pagamento</th><th>Mensalista</th><th>Forma</th><th>Próximo pagamento</th><th>Valor</th></tr></thead>
                <tbody>
                  {dados.mensalidades.map((p) => (
                    <tr key={p.id}>
                      <td className="mono">{fmtDataBR(p.dt_pagamento)}</td>
                      <td>{p.mensalista}</td>
                      <td>{p.forma}</td>
                      <td className="mono">{fmtDataBR(p.proximo_pagamento)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtBRL(p.valor)}</td>
                    </tr>
                  ))}
                  {dados.mensalidades.length === 0 && <tr><td colSpan={5} className="suave">Nenhuma mensalidade recebida no período.</td></tr>}
                </tbody>
                {dados.mensalidades.length > 0 && (
                  <tfoot><tr>
                    <td colSpan={4}><strong>Total</strong></td>
                    <td style={{ textAlign: 'right' }}><strong>{fmtBRL(dados.mensalidadesTotal)}</strong></td>
                  </tr></tfoot>
                )}
              </table>
            </div>
          </div>

          {verVeiculos && (
            <div className="card">
              <h2>Veículos ({veiculos.length})</h2>
              <div className="tabela-scroll">
                <table>
                  <thead><tr>
                    <th>Placa</th><th>Carro</th><th>Tabela</th><th>Entrada</th><th>Saída</th>
                    <th>Tempo</th><th>Pagamento</th><th>Valor</th><th>Desc. convênio</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {veiculos.map((v) => (
                      <tr key={v.id}>
                        <td><span className="placa mono">{v.placa}</span></td>
                        <td>{v.modelo || '—'}</td>
                        <td className="mono">{v.tipo_veic}</td>
                        <td className="mono">{v.dt_entrada.split('-').reverse().join('/')} {fmtHora(Number(v.hr_entrada))}</td>
                        <td className="mono">{v.cancelado ? '—' : `${v.dt_saida.split('-').reverse().join('/')} ${fmtHora(Number(v.hr_saida))}`}</td>
                        <td className="mono">{v.tempo != null ? fmtHora(v.tempo) : '—'}</td>
                        <td>{v.pagamento}</td>
                        <td>
                          {v.cancelado ? '—' : (
                            <>
                              {fmtBRL(v.valor)}
                              {v.valorCalculado != null && (
                                <span title={`Valor alterado na saída — o cálculo dava ${fmtBRL(v.valorCalculado)}`}> *</span>
                              )}
                            </>
                          )}
                        </td>
                        <td>{v.cancelado || !v.descontoConvenio ? '—' : fmtBRL(v.descontoConvenio)}</td>
                        <td>{v.cancelado && <span className="status status-cancelada">Cancelado</span>}</td>
                      </tr>
                    ))}
                    {veiculos.length === 0 && <tr><td colSpan={10} className="suave">Nenhum veículo no período.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Kpi({ rotulo, valor, destaque }) {
  return <div className={'kpi' + (destaque ? ' destaque' : '')}><div className="kpi-rotulo">{rotulo}</div><div className="kpi-valor">{valor}</div></div>;
}
function rotuloTipo(t) {
  return { E: 'Avulso', I: 'Mensalista', P: 'Pacote', H: 'Hóspede', C: 'Convênio' }[t] || t || '—';
}
