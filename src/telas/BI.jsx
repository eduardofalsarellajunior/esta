import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { hojeISO, dataDeISO, fmtBRL, fmtHora } from '../lib/tempo.js';
import { horas, minuto, minutosParaHHMM } from '../../packages/tarifacao/tarifacao.ts';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Impressão numa janela dedicada (mesmo padrão do ticket de entrada/saída).
function imprimirRelatorio(dados, de, ate, filial) {
  const cabecalho = filial && (filial.nome_fantasia || filial.endereco || filial.cnpj) ? `
    ${filial.nome_fantasia ? `<div class="nome">${escapeHtml(filial.nome_fantasia)}</div>` : ''}
    ${filial.endereco ? `<div class="linha-end">${escapeHtml(filial.endereco)}</div>` : ''}
    ${filial.cnpj ? `<div class="linha-end">CNPJ: ${escapeHtml(filial.cnpj)}</div>` : ''}
    <hr>` : '';

  const kpis = [
    ['Saídas', dados.totalVeic],
    ['Faturamento', fmtBRL(dados.faturamento)],
    ['Descontos (conv.)', fmtBRL(dados.descontos)],
    ['Tempo médio', fmtHora(dados.tempoMedio)],
  ].map(([r, v]) => `<p><strong>${escapeHtml(r)}:</strong> ${escapeHtml(v)}</p>`).join('');

  const porTipo = Object.entries(dados.porTipo)
    .map(([k, v]) => `<tr><td>${escapeHtml(rotuloTipo(k))}</td><td style="text-align:right">${v}</td></tr>`).join('');
  const porForma = Object.entries(dados.porForma)
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td style="text-align:right">${escapeHtml(fmtBRL(v))}</td></tr>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relatório BI</title>
    <style>
      body { font-family: system-ui, Arial, sans-serif; color: #000; padding: 20px; max-width: 480px; }
      .nome { font-size: 18px; font-weight: 800; margin-bottom: 2px; }
      .linha-end { font-size: 12px; color: #333; margin-bottom: 2px; }
      hr { border: none; border-top: 1px dashed #999; margin: 12px 0; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      h2 { font-size: 14px; margin: 16px 0 6px; }
      p { font-size: 13px; margin: 3px 0; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      td { padding: 4px 0; border-bottom: 1px solid #ddd; }
    </style></head><body>
      ${cabecalho}
      <h1>Painel / BI</h1>
      <p class="linha-end">Período: ${escapeHtml(de.split('-').reverse().join('/'))} a ${escapeHtml(ate.split('-').reverse().join('/'))}</p>
      ${kpis}
      <h2>Por tipo</h2>
      <table><tbody>${porTipo || '<tr><td>—</td></tr>'}</tbody></table>
      <h2>Por forma de pagamento</h2>
      <table><tbody>${porForma || '<tr><td>Sem pagamentos no período.</td></tr>'}</tbody></table>
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
  linhas.push(`Faturamento: ${fmtBRL(dados.faturamento)}`);
  linhas.push(`Descontos (conv.): ${fmtBRL(dados.descontos)}`);
  linhas.push(`Tempo médio: ${fmtHora(dados.tempoMedio)}`);
  linhas.push('');
  linhas.push('Por tipo:');
  for (const [k, v] of Object.entries(dados.porTipo)) linhas.push(`  ${rotuloTipo(k)}: ${v}`);
  linhas.push('');
  linhas.push('Por forma de pagamento:');
  const formas = Object.entries(dados.porForma);
  if (formas.length) for (const [k, v] of formas) linhas.push(`  ${k}: ${fmtBRL(v)}`);
  else linhas.push('  Sem pagamentos no período.');
  return linhas.join('\n');
}

function linkWhatsAppRelatorio(texto) {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

function linkEmailRelatorio(texto, de, ate) {
  const assunto = `Relatório BI — ${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`;
  return `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;
}

export default function BI({ perfil }) {
  const [de, setDe] = useState(hojeISO());
  const [ate, setAte] = useState(hojeISO());
  const [dados, setDados] = useState(null);
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
    const ids = movs.map((m) => m.id);
    let pagtos = [];
    if (ids.length) {
      const { data } = await supabase.from('movimento_pagamentos').select('*').in('movimento_id', ids);
      pagtos = data || [];
    }
    const { data: formas } = await supabase.from('formas_pagamento').select('codigo,descricao');
    const descForma = Object.fromEntries((formas || []).map((f) => [f.codigo, f.descricao]));

    const porTipo = {};
    let faturamento = 0, tabelaCheia = 0, minutosTotal = 0, saidasComTempo = 0;
    for (const m of movs) {
      porTipo[m.tipo_mens] = (porTipo[m.tipo_mens] || 0) + 1;
      faturamento += Number(m.valor || 0);
      tabelaCheia += Number(m.valor_proporcional || 0);
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
    for (const p of pagtos) {
      const k = descForma[p.forma_pagamento] || p.forma_pagamento;
      porForma[k] = (porForma[k] || 0) + Number(p.valor || 0);
    }
    setDados({
      totalVeic: movs.length, faturamento, tabelaCheia, descontos: tabelaCheia - faturamento,
      porTipo, porForma, tempoMedio: saidasComTempo ? minutosParaHHMM(Math.round(minutosTotal / saidasComTempo)) : 0,
    });
  }, [de, ate]);

  useEffect(() => { carregar(); const t = setInterval(carregar, 30000); return () => clearInterval(t); }, [carregar]);

  return (
    <>
      <div className="card">
        <div className="card-cab">
          <div><h2>Painel / BI</h2><p className="suave">Indicadores em tempo real (atualiza a cada 30s).</p></div>
          <div className="linha-form">
            <div className="campo"><label>De</label><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
            <div className="campo"><label>Até</label><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
            <button className="btn-ghost" onClick={carregar}>Atualizar</button>
            <button className="btn-ghost" disabled={!dados}
              onClick={() => window.open(linkWhatsAppRelatorio(textoRelatorio(dados, de, ate, filial)), '_blank')}>
              WhatsApp
            </button>
            <button className="btn-ghost" disabled={!dados}
              onClick={() => { window.location.href = linkEmailRelatorio(textoRelatorio(dados, de, ate, filial), de, ate); }}>
              Email
            </button>
            <button className="btn-primary" disabled={!dados} onClick={() => imprimirRelatorio(dados, de, ate, filial)}>Imprimir</button>
          </div>
        </div>
        {erro && <div className="aviso">{erro}</div>}
      </div>

      {dados && (
        <>
          <div className="kpis">
            <Kpi rotulo="Saídas" valor={dados.totalVeic} />
            <Kpi rotulo="Faturamento" valor={fmtBRL(dados.faturamento)} destaque />
            <Kpi rotulo="Descontos (conv.)" valor={fmtBRL(dados.descontos)} />
            <Kpi rotulo="Tempo médio" valor={fmtHora(dados.tempoMedio)} />
          </div>

          <div className="card">
            <h2>Por tipo</h2>
            <table><tbody>
              {Object.entries(dados.porTipo).map(([k, v]) => (
                <tr key={k}><td>{rotuloTipo(k)}</td><td style={{ textAlign: 'right' }}>{v}</td></tr>
              ))}
            </tbody></table>
          </div>

          <div className="card">
            <h2>Por forma de pagamento</h2>
            <table><tbody>
              {Object.entries(dados.porForma).map(([k, v]) => (
                <tr key={k}><td>{k}</td><td style={{ textAlign: 'right' }}>{fmtBRL(v)}</td></tr>
              ))}
              {Object.keys(dados.porForma).length === 0 && <tr><td className="suave">Sem pagamentos no período.</td></tr>}
            </tbody></table>
          </div>
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
