import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { carregarTabelasPreco, carregarPatio, carregarModelosVeiculo, carregarTabelasManuais } from '../lib/dados.js';
import { agoraHHMM, hojeISO, dataDeISO, fmtHora, fmtBRL } from '../lib/tempo.js';
import { calcularTarifa } from '../../packages/tarifacao/tarifacao.ts';

const MENSALISTA = new Set(['I', 'P', 'H']);

function normalizar(s) {
  return (s || '').toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// Placa antiga (ABC1234) ou Mercosul (ABC1D23): 3 letras + 1 número + (3 números OU 1 letra + 2 números).
const REGEX_PLACA = /^[A-Z]{3}\d(\d{3}|[A-Z]\d{2})$/;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Impressão numa janela dedicada (não no modal): evita a duplicação de página que
// ocorre ao imprimir conteúdo dentro de um overlay position:fixed.
function imprimirTicket(ticket, filial) {
  const cabecalho = filial && (filial.nome_fantasia || filial.endereco || filial.cnpj) ? `
    ${filial.nome_fantasia ? `<div class="nome">${escapeHtml(filial.nome_fantasia)}</div>` : ''}
    ${filial.endereco ? `<div class="linha-end">${escapeHtml(filial.endereco)}</div>` : ''}
    ${filial.cnpj ? `<div class="linha-end">CNPJ: ${escapeHtml(filial.cnpj)}</div>` : ''}
    <hr>` : '';
  const corpo = ticket.linhas.map(([r, v]) => `<p><strong>${escapeHtml(r)}:</strong> ${escapeHtml(v)}</p>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(ticket.titulo)}</title>
    <style>
      body { font-family: system-ui, Arial, sans-serif; color: #000; padding: 16px; max-width: 320px; }
      .nome { font-size: 16px; font-weight: 800; margin-bottom: 2px; }
      .linha-end { font-size: 11px; color: #333; margin-bottom: 2px; }
      hr { border: none; border-top: 1px dashed #999; margin: 10px 0; }
      h2 { font-size: 14px; margin: 0 0 8px; }
      p { font-size: 13px; margin: 4px 0; }
    </style></head><body>
      ${cabecalho}
      <h2>${escapeHtml(ticket.titulo)}</h2>
      ${corpo}
    </body></html>`;
  const win = window.open('', '_blank', 'width=380,height=600');
  if (!win) { window.alert('Permita pop-ups para imprimir o ticket.'); return; }
  win.document.write(html);
  win.document.close();
  win.onafterprint = () => win.close();
  win.focus();
  win.print();
}

export default function Patio({ perfil }) {
  const [tabelas, setTabelas] = useState({});
  const [convenios, setConvenios] = useState({});
  const [formas, setFormas] = useState([]);
  const [patio, setPatio] = useState([]);
  const [placa, setPlaca] = useState('');
  const [detectado, setDetectado] = useState(null); // {mensalista, convenio_codigo, tipo_mens}
  const [erro, setErro] = useState('');
  const [saindo, setSaindo] = useState(null);

  // Busca de modelo de carro (Entrada) + fallback de tabela manual.
  const [modelos, setModelos] = useState([]);
  const [tabelasManuais, setTabelasManuais] = useState([]);
  const [buscaModelo, setBuscaModelo] = useState('');
  const [modeloSelecionado, setModeloSelecionado] = useState(null);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [tabelaManual, setTabelaManual] = useState('');
  const [nomeCarroNovo, setNomeCarroNovo] = useState('');
  const [confirmNovo, setConfirmNovo] = useState(null); // { nome, tipo }
  const [confirmPlaca, setConfirmPlaca] = useState(null); // placa digitada, fora do formato esperado
  const [ticket, setTicket] = useState(null); // { titulo, linhas: [[rotulo, valor], ...] }
  const [celularTicket, setCelularTicket] = useState('');
  const [filial, setFilial] = useState(null); // { nome_fantasia, endereco, cnpj } — cabeçalho do ticket
  const [saidasRecentes, setSaidasRecentes] = useState([]);

  const sugestoes = useMemo(() => {
    const alvo = normalizar(buscaModelo);
    if (alvo.length < 2) return [];
    return modelos.filter((m) => normalizar(m.nome).includes(alvo)).slice(0, 8);
  }, [buscaModelo, modelos]);

  async function recarregar() {
    try {
      const [t, p, cv, fp, md, tm, sr, fl] = await Promise.all([
        carregarTabelasPreco(), carregarPatio(),
        supabase.from('convenios').select('*'),
        supabase.from('formas_pagamento').select('*').eq('ativo', true).order('codigo'),
        carregarModelosVeiculo(), carregarTabelasManuais(),
        supabase.from('movimentos').select('*').eq('dt_saida', hojeISO()).order('hr_saida', { ascending: false }).limit(50),
        supabase.from('filiais').select('nome_fantasia, endereco, cnpj').eq('id', perfil.filial_id).maybeSingle(),
      ]);
      setTabelas(t); setPatio(p);
      setConvenios(Object.fromEntries((cv.data || []).map((c) => [c.codigo, c])));
      setFormas(fp.data || []);
      setModelos(md); setTabelasManuais(tm);
      setSaidasRecentes(sr.data || []);
      setFilial(fl.data || null);
    } catch (e) { setErro(e.message); }
  }
  useEffect(() => { recarregar(); /* eslint-disable-next-line */ }, []);

  function encontrarNoPatio(p) {
    return patio.find((m) => m.placa === p);
  }

  // Detecção de mensalista ao digitar a placa.
  async function detectar(pl) {
    const p = pl.trim().toUpperCase();
    setDetectado(null);
    if (p.length < 3) return;

    // Placa já estacionada? Pula direto pra rotina de saída.
    const jaNoPatio = encontrarNoPatio(p);
    if (jaNoPatio) { limparFormEntrada(); prepararSaida(jaNoPatio); return; }

    const { data: mv } = await supabase.from('mensalista_veiculos').select('mensalista_id').eq('placa', p).maybeSingle();
    if (!mv) return;
    const { data: m } = await supabase.from('mensalistas').select('*').eq('id', mv.mensalista_id).maybeSingle();
    if (!m || !m.ativo) return;
    let convCod = null;
    if (m.convenio_id) {
      const { data: c } = await supabase.from('convenios').select('codigo').eq('id', m.convenio_id).maybeSingle();
      convCod = c?.codigo ?? null;
    }
    setDetectado({ nome: m.razao, tipo_mens: m.tipo_mens, convenio_codigo: convCod });
  }

  function onBuscaModeloChange(v) {
    setBuscaModelo(v);
    setMostrarSugestoes(true);
    setModeloSelecionado((m) => (m && normalizar(v) !== normalizar(m.nome)) ? null : m);
  }

  function selecionarModelo(m) {
    setModeloSelecionado(m);
    setBuscaModelo(m.nome);
    setMostrarSugestoes(false);
    setTabelaManual(''); setNomeCarroNovo('');
  }

  // Pré-preenche o nome do carro novo com o que foi digitado, enquanto nada foi
  // selecionado do catálogo (o operador ainda pode editar antes de confirmar).
  useEffect(() => {
    if (!modeloSelecionado) setNomeCarroNovo(buscaModelo);
    // eslint-disable-next-line
  }, [buscaModelo]);

  function limparFormEntrada() {
    setPlaca(''); setDetectado(null);
    setBuscaModelo(''); setModeloSelecionado(null); setMostrarSugestoes(false);
    setTabelaManual(''); setNomeCarroNovo(''); setConfirmNovo(null);
  }

  async function registrarEntrada(tipoVeic, nomeModelo) {
    const p = placa.trim().toUpperCase();
    const dtEntrada = hojeISO();
    const hrEntrada = agoraHHMM();
    const { error } = await supabase.from('movimentos').insert({
      filial_id: perfil.filial_id, placa: p, modelo: nomeModelo || null,
      dt_entrada: dtEntrada, hr_entrada: hrEntrada,
      tipo_veic: tipoVeic,
      tipo_mens: detectado?.tipo_mens || 'E',
      convenio_codigo: detectado?.convenio_codigo || null,
      usuario_entrada: perfil.id,
    });
    if (error) { setErro(error.code === '23505' ? 'Essa placa já está no pátio.' : error.message); return; }
    setTicket({
      titulo: 'Ticket de entrada',
      linhas: [
        ['Placa', p],
        ['Carro', nomeModelo || '—'],
        ['Tabela', tipoVeic],
        ['Entrada', `${dtEntrada.split('-').reverse().join('/')} ${fmtHora(Number(hrEntrada))}`],
        ['Operador', perfil.nome],
      ],
    });
    setCelularTicket('');
    limparFormEntrada();
    recarregar();
  }

  async function darEntrada(e) {
    e.preventDefault();
    setErro('');
    const p = placa.trim().toUpperCase();
    if (!p) return;

    // Segurança extra (ex.: Enter sem sair do campo, sem disparar o onBlur).
    const jaNoPatio = encontrarNoPatio(p);
    if (jaNoPatio) { limparFormEntrada(); prepararSaida(jaNoPatio); return; }

    if (!REGEX_PLACA.test(p)) { setConfirmPlaca(p); return; }
    await prosseguirEntrada();
  }

  async function prosseguirEntrada() {
    if (modeloSelecionado) {
      await registrarEntrada(modeloSelecionado.tabela_tipo, modeloSelecionado.nome);
      return;
    }
    if (tabelaManual && nomeCarroNovo.trim()) {
      setConfirmNovo({ nome: nomeCarroNovo.trim(), tipo: tabelaManual });
      return;
    }
    setErro('Digite um carro do catálogo, ou selecione a tabela manual e o nome do carro novo.');
  }

  async function confirmarPlacaForcada() {
    setConfirmPlaca(null);
    await prosseguirEntrada();
  }

  function corrigirPlaca() {
    setConfirmPlaca(null);
    setPlaca('');
    setDetectado(null);
  }

  async function confirmarNovoCarro() {
    if (!confirmNovo) return;
    const { nome, tipo } = confirmNovo;
    const codigo = `AUTO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data: novo, error } = await supabase.from('modelos_veiculo')
      .insert({ filial_id: perfil.filial_id, codigo, nome, tabela_tipo: tipo, ativo: true })
      .select().single();
    if (error) { setErro(error.message); setConfirmNovo(null); return; }
    setModelos((ms) => [...ms, novo]);
    setConfirmNovo(null);
    await registrarEntrada(tipo, nome);
  }

  function prepararSaida(mov) {
    try {
      let resultado;
      const ehMensalista = MENSALISTA.has(mov.tipo_mens);
      if (ehMensalista) {
        // Mensalista: já paga a mensalidade; saída sem cobrança nesta fase.
        resultado = { valor: 0, valorProporcional: 0, valorConvenio: 0, pontos: 0, diarias: 0, mensalista: true,
          tempoDecorrido: 0, residual: 0 };
      } else {
        const convenio = mov.convenio_codigo ? mapConvenio(convenios[mov.convenio_codigo]) : undefined;
        resultado = calcularTarifa({
          tabelas, tipoVeic: mov.tipo_veic, convenio,
          movimento: { dtEntrada: dataDeISO(mov.dt_entrada), entrada: Number(mov.hr_entrada), dtSaida: new Date(), saida: agoraHHMM() },
        });
      }
      const formaPadrao = formas.find((f) => f.eh_dinheiro)?.codigo || formas[0]?.codigo || 'D';
      setSaindo({ mov, resultado, pagamentos: [{ forma: formaPadrao, valor: resultado.valor }] });
    } catch (e) { setErro(e.message); }
  }

  async function confirmarSaida() {
    const { mov, resultado, pagamentos } = saindo;
    const dtSaida = hojeISO();
    const hrSaida = agoraHHMM();
    // Liga ao caixa aberto do operador (se houver), para o fechamento.
    const { data: cx } = await supabase.from('caixas').select('id')
      .eq('operador_id', perfil.id).eq('status', 'aberto').maybeSingle();
    const { error } = await supabase.from('movimentos').update({
      dt_saida: dtSaida, hr_saida: hrSaida,
      valor: resultado.valor, valor_proporcional: resultado.valorProporcional,
      valor_convenio: resultado.valorConvenio, pontos_ganhos: resultado.pontos,
      caixa_id: cx?.id ?? null, usuario_saida: perfil.id,
    }).eq('id', mov.id);
    if (error) { setErro(error.message); return; }

    // Rateio de pagamento.
    const pagos = pagamentos.filter((p) => Number(p.valor) > 0);
    const linhasPag = pagos.map((p) => ({ filial_id: perfil.filial_id, movimento_id: mov.id, forma_pagamento: p.forma, valor: Number(p.valor) }));
    if (linhasPag.length) await supabase.from('movimento_pagamentos').insert(linhasPag);

    // Fidelidade (best-effort).
    if (!resultado.mensalista) await atualizarFidelidade(mov.placa, resultado.pontos);

    const formaTexto = resultado.mensalista ? 'Mensalista/hóspede'
      : (pagos.map((p) => formas.find((f) => f.codigo === p.forma)?.descricao || p.forma).join(' + ') || '—');
    setTicket({
      titulo: 'Ticket de saída',
      linhas: [
        ['Placa', mov.placa],
        ['Carro', mov.modelo || '—'],
        ['Entrada', `${mov.dt_entrada.split('-').reverse().join('/')} ${fmtHora(Number(mov.hr_entrada))}`],
        ['Tempo', resultado.mensalista ? '—' : fmtHora(resultado.tempoDecorrido)],
        ['Valor', fmtBRL(resultado.valor)],
        ['Pagamento', formaTexto],
        ['Saída', `${dtSaida.split('-').reverse().join('/')} ${fmtHora(Number(hrSaida))}`],
        ['Operador', perfil.nome],
      ],
    });
    setCelularTicket('');
    setSaindo(null); recarregar();
  }

  async function reimprimirSaida(mov) {
    const { data: pagtos } = await supabase.from('movimento_pagamentos')
      .select('forma_pagamento, valor').eq('movimento_id', mov.id);
    const formaTexto = pagtos && pagtos.length
      ? pagtos.map((p) => formas.find((f) => f.codigo === p.forma_pagamento)?.descricao || p.forma_pagamento).join(' + ')
      : (MENSALISTA.has(mov.tipo_mens) ? 'Mensalista/hóspede' : '—');
    setTicket({
      titulo: 'Ticket de saída (reimpressão)',
      linhas: [
        ['Placa', mov.placa],
        ['Carro', mov.modelo || '—'],
        ['Entrada', `${mov.dt_entrada.split('-').reverse().join('/')} ${fmtHora(Number(mov.hr_entrada))}`],
        ['Valor', fmtBRL(Number(mov.valor || 0))],
        ['Pagamento', formaTexto],
        ['Saída', `${mov.dt_saida.split('-').reverse().join('/')} ${fmtHora(Number(mov.hr_saida))}`],
        ['Reimpresso por', perfil.nome],
      ],
    });
    setCelularTicket('');
  }

  async function atualizarFidelidade(placa, pontos) {
    try {
      const { data: c } = await supabase.from('clientes').select('*').eq('placa', placa).maybeSingle();
      if (c) {
        await supabase.from('clientes').update({
          qte_visitas: (c.qte_visitas || 0) + 1, qte_pontos: Number(c.qte_pontos || 0) + Number(pontos || 0), ult_visita: hojeISO(),
        }).eq('id', c.id);
      } else {
        await supabase.from('clientes').insert({
          filial_id: perfil.filial_id, placa, qte_visitas: 1, qte_pontos: Number(pontos || 0), ult_visita: hojeISO(),
        });
      }
    } catch { /* fidelidade é best-effort */ }
  }

  const totalPago = (saindo?.pagamentos || []).reduce((s, p) => s + Number(p.valor || 0), 0);

  return (
    <>
      {erro && <div className="card aviso">{erro}</div>}

      <div className="card">
        <h2>Entrada de veículo</h2>
        <form className="linha-form" onSubmit={darEntrada}>
          <div className="campo">
            <label>Placa</label>
            <input className="mono" value={placa}
              onChange={(e) => { setPlaca(e.target.value); setConfirmPlaca(null); }}
              onBlur={(e) => detectar(e.target.value)}
              placeholder="ABC1D23" style={{ textTransform: 'uppercase', width: 140 }} />
          </div>
          <div className="campo campo-busca" style={{ minWidth: 220 }}>
            <label>Carro</label>
            <input value={buscaModelo}
              onChange={(e) => onBuscaModeloChange(e.target.value)}
              onFocus={() => setMostrarSugestoes(true)}
              onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
              placeholder="Digite o modelo do carro…" style={{ width: '100%' }} />
            {mostrarSugestoes && sugestoes.length > 0 && (
              <ul className="sugestoes-lista">
                {sugestoes.map((m) => (
                  <li key={m.id} className="sugestao-item"
                    onMouseDown={(e) => { e.preventDefault(); selecionarModelo(m); }}>
                    {m.nome}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {modeloSelecionado && <span className="badge-mens">Tabela: {modeloSelecionado.tabela_tipo}</span>}
          {buscaModelo.trim().length >= 2 && !modeloSelecionado && sugestoes.length === 0 && (
            <>
              <div className="campo">
                <label>Tabela de preço (carro não encontrado)</label>
                <select value={tabelaManual} onChange={(e) => setTabelaManual(e.target.value)}>
                  <option value="">—</option>
                  {tabelasManuais.map((t) => <option key={t.tipo} value={t.tipo}>{t.tipo} · {t.descricao}</option>)}
                </select>
                {tabelasManuais.length === 0 && <span className="suave" style={{ fontSize: 11 }}>Nenhuma tabela liberada — marque em Preços.</span>}
              </div>
              <div className="campo">
                <label>Nome do carro (novo)</label>
                <input value={nomeCarroNovo} onChange={(e) => setNomeCarroNovo(e.target.value)} />
              </div>
            </>
          )}
          <button className="btn-primary" type="submit">Registrar entrada</button>
          {detectado && (
            <span className="badge-mens">
              {detectado.tipo_mens === 'H' ? 'Hóspede' : 'Mensalista'}: {detectado.nome}
              {detectado.convenio_codigo && ` · conv. ${detectado.convenio_codigo}`}
            </span>
          )}
        </form>
      </div>

      <div className="card">
        <h2>No pátio ({patio.length})</h2>
        <div className="tabela-scroll">
          <table>
            <thead><tr><th>Placa</th><th>Carro</th><th>Tabela</th><th>Tipo</th><th>Entrada</th><th></th></tr></thead>
            <tbody>
              {patio.map((m) => (
                <tr key={m.id}>
                  <td><span className="placa mono">{m.placa}</span></td>
                  <td>{m.modelo || '—'}</td>
                  <td>{m.tipo_veic}</td>
                  <td>{rotuloTipo(m.tipo_mens)}{m.convenio_codigo ? ` · ${m.convenio_codigo}` : ''}</td>
                  <td className="mono">{m.dt_entrada.split('-').reverse().join('/')} {fmtHora(Number(m.hr_entrada))}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn-primary" onClick={() => prepararSaida(m)}>Saída</button></td>
                </tr>
              ))}
              {patio.length === 0 && <tr><td colSpan={6} className="suave">Pátio vazio.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Saídas de hoje ({saidasRecentes.length})</h2>
        <div className="tabela-scroll">
          <table>
            <thead><tr><th>Placa</th><th>Carro</th><th>Saída</th><th>Valor</th><th></th></tr></thead>
            <tbody>
              {saidasRecentes.map((m) => (
                <tr key={m.id}>
                  <td><span className="placa mono">{m.placa}</span></td>
                  <td>{m.modelo || '—'}</td>
                  <td className="mono">{fmtHora(Number(m.hr_saida))}</td>
                  <td>{fmtBRL(Number(m.valor || 0))}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn-ghost" onClick={() => reimprimirSaida(m)}>Reimprimir</button></td>
                </tr>
              ))}
              {saidasRecentes.length === 0 && <tr><td colSpan={5} className="suave">Nenhuma saída hoje.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {confirmPlaca && (
        <div className="modal-bg" onClick={corrigirPlaca}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Confirmar placa</h2>
            <p className="suave">Essa placa não parece ter um formato válido (ex.: ABC1234 ou ABC1D23).</p>
            <div className="grande mono">{confirmPlaca}</div>
            <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-ghost" onClick={corrigirPlaca}>Não, digitar outra</button>
              <button className="btn-primary" onClick={confirmarPlacaForcada}>Sim, está correta</button>
            </div>
          </div>
        </div>
      )}

      {confirmNovo && (
        <div className="modal-bg" onClick={() => setConfirmNovo(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Confirmar carro novo</h2>
            <p className="suave">Confira se o nome está certo — ele entra no catálogo de modelos permanentemente.</p>
            <div className="grande">{confirmNovo.nome}</div>
            <p className="mono suave" style={{ textAlign: 'center' }}>Tabela: {confirmNovo.tipo}</p>
            <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => setConfirmNovo(null)}>Cancelar</button>
              <button className="btn-primary" onClick={confirmarNovoCarro}>Confirmar e adicionar</button>
            </div>
          </div>
        </div>
      )}

      {ticket && (
        <div className="modal-bg" onClick={() => setTicket(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="ticket-impressao">
              <h2>{ticket.titulo}</h2>
              {ticket.linhas.map(([rotulo, valor]) => (
                <p className="mono" key={rotulo}>{rotulo}: <strong>{valor}</strong></p>
              ))}
            </div>
            <div className="campo" style={{ marginTop: 10 }}>
              <label>Celular para WhatsApp (opcional)</label>
              <input value={celularTicket} onChange={(e) => setCelularTicket(e.target.value)} placeholder="(19) 99999-9999" />
            </div>
            <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => setTicket(null)}>Fechar</button>
              <a className="btn-ghost" href={linkWhatsApp(ticket, celularTicket, filial)} target="_blank" rel="noopener noreferrer">Enviar por WhatsApp</a>
              <button className="btn-primary" onClick={() => imprimirTicket(ticket, filial)}>Imprimir</button>
            </div>
          </div>
        </div>
      )}

      {saindo && (
        <div className="modal-bg" onClick={() => setSaindo(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Saída — <span className="placa mono">{saindo.mov.placa}</span></h2>
            {saindo.resultado.mensalista ? (
              <p className="suave">Mensalista/hóspede — sem cobrança na saída (mensalidade paga à parte).</p>
            ) : (
              <p className="mono suave">
                Tempo: {fmtHora(saindo.resultado.tempoDecorrido)}
                {saindo.resultado.diarias > 0 && ` · ${saindo.resultado.diarias} diária(s)`}
                {saindo.resultado.valorConvenio > 0 && ` · conv. -${fmtBRL(saindo.resultado.valorConvenio)}`}
              </p>
            )}
            <div className="grande">{fmtBRL(saindo.resultado.valor)}</div>

            {!saindo.resultado.mensalista && saindo.resultado.valor > 0 && (
              <div style={{ margin: '12px 0' }}>
                <label className="suave">Pagamento</label>
                {saindo.pagamentos.map((p, i) => (
                  <div className="linha-form" key={i} style={{ marginTop: 6 }}>
                    <select value={p.forma} onChange={(e) => atualizaPagto(i, 'forma', e.target.value)}>
                      {formas.map((f) => <option key={f.codigo} value={f.codigo}>{f.descricao}</option>)}
                    </select>
                    <input type="number" step="0.01" value={p.valor}
                      onChange={(e) => atualizaPagto(i, 'valor', e.target.value)} style={{ width: 120 }} />
                    {saindo.pagamentos.length > 1 && <button className="btn-ghost" onClick={() => removePagto(i)}>×</button>}
                  </div>
                ))}
                <button className="btn-ghost" onClick={addPagto} style={{ marginTop: 6 }}>+ dividir pagamento</button>
                {Math.abs(totalPago - saindo.resultado.valor) > 0.005 && (
                  <p className="aviso">Soma dos pagamentos ({fmtBRL(totalPago)}) difere do valor.</p>
                )}
              </div>
            )}

            {saindo.resultado.manual && <p className="aviso">Tempo fora das faixas — confira o valor.</p>}
            <div className="linha-form" style={{ justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setSaindo(null)}>Cancelar</button>
              <button className="btn-primary" onClick={confirmarSaida}>Confirmar saída</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  function atualizaPagto(i, campo, valor) {
    setSaindo((s) => { const pg = s.pagamentos.map((p, j) => j === i ? { ...p, [campo]: valor } : p); return { ...s, pagamentos: pg }; });
  }
  function addPagto() {
    setSaindo((s) => ({ ...s, pagamentos: [...s.pagamentos, { forma: formas[0]?.codigo || 'D', valor: 0 }] }));
  }
  function removePagto(i) {
    setSaindo((s) => ({ ...s, pagamentos: s.pagamentos.filter((_, j) => j !== i) }));
  }
}

function linkWhatsApp(ticket, celular, filial) {
  const cabecalho = filial && (filial.nome_fantasia || filial.endereco || filial.cnpj)
    ? [filial.nome_fantasia, filial.endereco, filial.cnpj ? `CNPJ: ${filial.cnpj}` : null].filter(Boolean).join('\n') + '\n\n'
    : '';
  const texto = cabecalho + [ticket.titulo, ...ticket.linhas.map(([r, v]) => `${r}: ${v}`)].join('\n');
  const digitos = (celular || '').replace(/\D/g, '');
  const numero = digitos ? (digitos.startsWith('55') ? digitos : `55${digitos}`) : '';
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

function rotuloTipo(t) {
  return { E: 'Avulso', I: 'Mensalista', P: 'Pacote', H: 'Hóspede', C: 'Convênio' }[t] || t;
}

function mapConvenio(c) {
  if (!c) return undefined;
  return {
    codigo: c.codigo, tabConv: c.tab_conv || undefined, tabHoras: c.tab_horas,
    perConv: Number(c.perc_conv || 0), vlrConv: Number(c.vlr_conv || 0),
  };
}
