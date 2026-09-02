import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { hojeISO, fmtBRL, fmtHora } from '../lib/tempo.js';
import { agruparPorConvenio, gruposDeConvenios } from '../lib/relatorioConvenios.js';

// Relatório do que cada convênio deve — é com ele que se cobra o conveniado.
// Filtra pelo período de SAÍDA (é quando o valor do convênio é apurado, ver
// Patio.jsx/confirmarSaida) e quebra por grupo/código, ver relatorioConvenios.js.

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const dataBR = (iso) => (iso ? String(iso).split('-').reverse().join('/') : '—');
const dataHora = (data, hora) => `${dataBR(data)} ${hora != null ? fmtHora(Number(hora)) : ''}`.trim();

/** Colunas pedidas: controle, placa, modelo, entrada, saída e o valor do convênio. */
function linhasDaEstadia(m) {
  return [
    m.controle != null ? String(m.controle).padStart(4, '0') : '—',
    m.placa || '—',
    m.modelo || '—',
    dataHora(m.dt_entrada, m.hr_entrada),
    dataHora(m.dt_saida, m.hr_saida),
    fmtBRL(Number(m.valor_convenio || 0)),
  ];
}

// Impressão em janela dedicada — mesmo padrão do BI e dos tickets.
function imprimirRelatorio({ dados, de, ate, filial, convenioFiltro, grupoFiltro }) {
  const cabecalho = filial && (filial.nome_fantasia || filial.endereco || filial.cnpj) ? `
    ${filial.nome_fantasia ? `<div class="nome">${escapeHtml(filial.nome_fantasia)}</div>` : ''}
    ${filial.endereco ? `<div class="linha-end">${escapeHtml(filial.endereco)}</div>` : ''}
    ${filial.cnpj ? `<div class="linha-end">CNPJ: ${escapeHtml(filial.cnpj)}</div>` : ''}
    <hr>` : '';

  const tabela = (conv) => `
    <table>
      <thead><tr>
        <th>Controle</th><th>Placa</th><th>Modelo</th><th>Entrada</th><th>Saída</th>
        <th style="text-align:right">Vlr. convênio</th>
      </tr></thead>
      <tbody>
        ${conv.linhas.map((m) => {
          const [c, p, mo, e, s, v] = linhasDaEstadia(m);
          return `<tr><td>${escapeHtml(c)}</td><td>${escapeHtml(p)}</td><td>${escapeHtml(mo)}</td>`
            + `<td>${escapeHtml(e)}</td><td>${escapeHtml(s)}</td>`
            + `<td style="text-align:right">${escapeHtml(v)}</td></tr>`;
        }).join('')}
        <tr class="subtotal">
          <td colspan="5">Total ${escapeHtml(conv.codigo)} — ${conv.qtde} estadia(s)</td>
          <td style="text-align:right">${escapeHtml(fmtBRL(conv.total))}</td>
        </tr>
      </tbody>
    </table>`;

  const corpo = dados.grupos.map((g) => `
    ${g.grupo ? `<h2>Grupo ${escapeHtml(g.grupo)}</h2>` : ''}
    ${g.convenios.map((conv) => `
      <h3>${escapeHtml(conv.codigo)}${conv.razao ? ` · ${escapeHtml(conv.razao)}` : ''}</h3>
      ${tabela(conv)}
    `).join('')}
    ${g.grupo ? `<p class="total-grupo">Total do grupo ${escapeHtml(g.grupo)} —
      ${g.qtde} estadia(s): <strong>${escapeHtml(fmtBRL(g.total))}</strong></p>` : ''}
  `).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relatório de convênios</title>
    <style>
      @page { margin: 12mm; }
      body { font-family: system-ui, Arial, sans-serif; color: #000; }
      .nome { font-size: 18px; font-weight: 800; margin-bottom: 2px; }
      .linha-end { font-size: 12px; color: #333; margin-bottom: 2px; }
      hr { border: none; border-top: 1px dashed #999; margin: 12px 0; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      h2 { font-size: 15px; margin: 18px 0 4px; border-bottom: 2px solid #000; }
      h3 { font-size: 13px; margin: 12px 0 4px; }
      p { font-size: 13px; margin: 3px 0; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 4px; }
      th { text-align: left; padding: 3px 6px 3px 0; border-bottom: 1px solid #999; }
      td { padding: 3px 6px 3px 0; border-bottom: 1px solid #ddd; }
      .subtotal td { font-weight: 700; border-top: 1px solid #999; border-bottom: none; }
      .total-grupo { font-size: 13px; margin: 4px 0 10px; text-align: right; }
      .total-geral { font-size: 14px; margin-top: 14px; padding-top: 6px; border-top: 2px solid #000; text-align: right; }
    </style></head><body>
      ${cabecalho}
      <h1>Relatório de convênios</h1>
      <p class="linha-end">Saídas de ${escapeHtml(dataBR(de))} a ${escapeHtml(dataBR(ate))}</p>
      ${convenioFiltro ? `<p class="linha-end">Convênio: ${escapeHtml(convenioFiltro)}</p>` : ''}
      ${grupoFiltro ? `<p class="linha-end">Grupo: ${escapeHtml(grupoFiltro)}</p>` : ''}
      ${corpo || '<p>Nenhuma estadia de convênio no período.</p>'}
      <p class="total-geral">Total geral — ${dados.qtde} estadia(s):
        <strong>${escapeHtml(fmtBRL(dados.total))}</strong></p>
    </body></html>`;

  const win = window.open('', '_blank', 'width=520,height=650');
  if (!win) { window.alert('Permita pop-ups para imprimir o relatório.'); return; }
  win.document.write(html);
  win.document.close();
  win.onafterprint = () => win.close();
  win.focus();
  win.print();
}

export default function RelatorioConvenios({ perfil }) {
  const [de, setDe] = useState(hojeISO());
  const [ate, setAte] = useState(hojeISO());
  const [convenioFiltro, setConvenioFiltro] = useState('');
  const [grupoFiltro, setGrupoFiltro] = useState('');
  const [convenios, setConvenios] = useState([]);
  const [dados, setDados] = useState(null);
  const [filial, setFilial] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    supabase.from('convenios').select('codigo, razao, grupo').order('codigo')
      .then(({ data }) => setConvenios(data || []));
    supabase.from('filiais').select('nome_fantasia, endereco, cnpj').eq('id', perfil.filial_id).maybeSingle()
      .then(({ data }) => setFilial(data));
  }, [perfil.filial_id]);

  const carregar = useCallback(async () => {
    setErro(''); setCarregando(true);
    // Só saídas já fechadas e com convênio escolhido. O filtro de grupo é
    // resolvido aqui pelos códigos que pertencem a ele — `convenios.grupo`
    // não está no movimento, só o código.
    let q = supabase.from('movimentos')
      .select('id, controle, placa, modelo, dt_entrada, hr_entrada, dt_saida, hr_saida, valor_convenio, convenio_codigo')
      .gte('dt_saida', de).lte('dt_saida', ate)
      .not('convenio_codigo', 'is', null)
      .order('dt_saida').order('hr_saida');
    if (convenioFiltro) q = q.eq('convenio_codigo', convenioFiltro);
    if (grupoFiltro) {
      const codigos = convenios.filter((c) => String(c.grupo || '').trim() === grupoFiltro).map((c) => c.codigo);
      // Grupo sem nenhum convênio: `in` com lista vazia devolve tudo em vez de
      // nada, então corta aqui mesmo.
      if (!codigos.length) { setDados({ grupos: [], total: 0, qtde: 0 }); setCarregando(false); return; }
      q = q.in('convenio_codigo', codigos);
    }
    const { data, error } = await q;
    setCarregando(false);
    if (error) { setErro(error.message); return; }
    const porCodigo = Object.fromEntries(convenios.map((c) => [c.codigo, c]));
    setDados(agruparPorConvenio(data || [], porCodigo));
  }, [de, ate, convenioFiltro, grupoFiltro, convenios]);

  // Espera os convênios chegarem: sem eles o agrupamento não sabe grupo/razão.
  useEffect(() => { if (convenios.length) carregar(); }, [carregar, convenios.length]);

  const grupos = gruposDeConvenios(convenios);

  return (
    <>
      <div className="card">
        <div className="card-cab">
          <div>
            <h2>Relatório de convênios</h2>
            <p className="suave">
              O que cada convênio deve no período, pelas saídas. Deixe Convênio e Grupo em
              branco pra trazer todos. Escolhendo um grupo, sai um bloco por código com o
              total de cada um e o total do grupo no fim.
            </p>
          </div>
          <button className="btn-ghost" disabled={!dados || carregando}
            onClick={() => imprimirRelatorio({ dados, de, ate, filial, convenioFiltro, grupoFiltro })}>
            Imprimir
          </button>
        </div>
        {erro && <div className="aviso">{erro}</div>}
        <div className="linha-form">
          <div className="campo">
            <label>Saída de</label>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="campo">
            <label>até</label>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="campo">
            <label>Convênio</label>
            <select value={convenioFiltro} onChange={(e) => setConvenioFiltro(e.target.value)}>
              <option value="">— Todos —</option>
              {convenios.map((c) => (
                <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.razao}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Grupo</label>
            <select value={grupoFiltro} onChange={(e) => setGrupoFiltro(e.target.value)}>
              <option value="">— Todos —</option>
              {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            {grupos.length === 0 && (
              <span className="suave" style={{ fontSize: 11 }}>
                Nenhum grupo cadastrado — o campo Grupo fica em Cadastros → Convênios.
              </span>
            )}
          </div>
        </div>
      </div>

      {carregando && <div className="card suave">Carregando…</div>}

      {dados && !carregando && (
        dados.grupos.length === 0 ? (
          <div className="card suave">Nenhuma estadia de convênio no período.</div>
        ) : (
          <>
            {dados.grupos.map((g) => (
              <div className="card" key={g.grupo || '_sem_grupo'}>
                {g.grupo && <h2>Grupo {g.grupo}</h2>}
                {g.convenios.map((conv) => (
                  <div key={conv.codigo} style={{ marginBottom: 14 }}>
                    <h3 style={{ marginBottom: 6 }}>
                      {conv.codigo}{conv.razao ? ` · ${conv.razao}` : ''}
                    </h3>
                    <div className="tabela-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Controle</th><th>Placa</th><th>Modelo</th>
                            <th>Entrada</th><th>Saída</th>
                            <th style={{ textAlign: 'right' }}>Vlr. convênio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {conv.linhas.map((m) => {
                            const [c, p, mo, e, s, v] = linhasDaEstadia(m);
                            return (
                              <tr key={m.id}>
                                <td className="mono">{c}</td>
                                <td className="mono">{p}</td>
                                <td>{mo}</td>
                                <td>{e}</td>
                                <td>{s}</td>
                                <td style={{ textAlign: 'right' }}>{v}</td>
                              </tr>
                            );
                          })}
                          <tr>
                            <td colSpan={5}><strong>Total {conv.codigo} — {conv.qtde} estadia(s)</strong></td>
                            <td style={{ textAlign: 'right' }}><strong>{fmtBRL(conv.total)}</strong></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                {g.grupo && (
                  <p style={{ textAlign: 'right' }}>
                    Total do grupo {g.grupo} — {g.qtde} estadia(s):{' '}
                    <strong>{fmtBRL(g.total)}</strong>
                  </p>
                )}
              </div>
            ))}
            <div className="card" style={{ textAlign: 'right' }}>
              Total geral — {dados.qtde} estadia(s): <strong>{fmtBRL(dados.total)}</strong>
            </div>
          </>
        )
      )}
    </>
  );
}
