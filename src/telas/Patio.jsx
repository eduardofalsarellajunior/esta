import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { carregarTabelasPreco, carregarPatio } from '../lib/dados.js';
import { agoraHHMM, hojeISO, dataDeISO, fmtHora, fmtBRL } from '../lib/tempo.js';
import { calcularTarifa } from '../../packages/tarifacao/tarifacao.ts';

const MENSALISTA = new Set(['I', 'P', 'H']);

export default function Patio({ perfil }) {
  const [tabelas, setTabelas] = useState({});
  const [convenios, setConvenios] = useState({});
  const [formas, setFormas] = useState([]);
  const [patio, setPatio] = useState([]);
  const [placa, setPlaca] = useState('');
  const [tipo, setTipo] = useState('');
  const [detectado, setDetectado] = useState(null); // {mensalista, convenio_codigo, tipo_mens}
  const [erro, setErro] = useState('');
  const [saindo, setSaindo] = useState(null);

  const tipos = useMemo(() => Object.keys(tabelas).sort(), [tabelas]);

  async function recarregar() {
    try {
      const [t, p, cv, fp] = await Promise.all([
        carregarTabelasPreco(), carregarPatio(),
        supabase.from('convenios').select('*'),
        supabase.from('formas_pagamento').select('*').eq('ativo', true).order('codigo'),
      ]);
      setTabelas(t); setPatio(p);
      setConvenios(Object.fromEntries((cv.data || []).map((c) => [c.codigo, c])));
      setFormas(fp.data || []);
      if (!tipo && Object.keys(t).length) setTipo(Object.keys(t).sort()[0]);
    } catch (e) { setErro(e.message); }
  }
  useEffect(() => { recarregar(); /* eslint-disable-next-line */ }, []);

  // Detecção de mensalista ao digitar a placa.
  async function detectar(pl) {
    const p = pl.trim().toUpperCase();
    setDetectado(null);
    if (p.length < 3) return;
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

  async function darEntrada(e) {
    e.preventDefault();
    setErro('');
    const p = placa.trim().toUpperCase();
    if (!p || !tipo) return;
    const { error } = await supabase.from('movimentos').insert({
      filial_id: perfil.filial_id, placa: p,
      dt_entrada: hojeISO(), hr_entrada: agoraHHMM(),
      tipo_veic: tipo,
      tipo_mens: detectado?.tipo_mens || 'E',
      convenio_codigo: detectado?.convenio_codigo || null,
      usuario_entrada: perfil.id,
    });
    if (error) { setErro(error.code === '23505' ? 'Essa placa já está no pátio.' : error.message); return; }
    setPlaca(''); setDetectado(null); recarregar();
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
    // Liga ao caixa aberto do operador (se houver), para o fechamento.
    const { data: cx } = await supabase.from('caixas').select('id')
      .eq('operador_id', perfil.id).eq('status', 'aberto').maybeSingle();
    const { error } = await supabase.from('movimentos').update({
      dt_saida: hojeISO(), hr_saida: agoraHHMM(),
      valor: resultado.valor, valor_proporcional: resultado.valorProporcional,
      valor_convenio: resultado.valorConvenio, pontos_ganhos: resultado.pontos,
      caixa_id: cx?.id ?? null, usuario_saida: perfil.id,
    }).eq('id', mov.id);
    if (error) { setErro(error.message); return; }

    // Rateio de pagamento.
    const linhas = pagamentos.filter((p) => Number(p.valor) > 0)
      .map((p) => ({ filial_id: perfil.filial_id, movimento_id: mov.id, forma_pagamento: p.forma, valor: Number(p.valor) }));
    if (linhas.length) await supabase.from('movimento_pagamentos').insert(linhas);

    // Fidelidade (best-effort).
    if (!resultado.mensalista) await atualizarFidelidade(mov.placa, resultado.pontos);

    setSaindo(null); recarregar();
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
              onChange={(e) => { setPlaca(e.target.value); }}
              onBlur={(e) => detectar(e.target.value)}
              placeholder="ABC1D23" style={{ textTransform: 'uppercase', width: 140 }} />
          </div>
          <div className="campo">
            <label>Tabela</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
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
            <thead><tr><th>Placa</th><th>Tabela</th><th>Tipo</th><th>Entrada</th><th></th></tr></thead>
            <tbody>
              {patio.map((m) => (
                <tr key={m.id}>
                  <td><span className="placa mono">{m.placa}</span></td>
                  <td>{m.tipo_veic}</td>
                  <td>{rotuloTipo(m.tipo_mens)}{m.convenio_codigo ? ` · ${m.convenio_codigo}` : ''}</td>
                  <td className="mono">{m.dt_entrada.split('-').reverse().join('/')} {fmtHora(Number(m.hr_entrada))}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn-primary" onClick={() => prepararSaida(m)}>Saída</button></td>
                </tr>
              ))}
              {patio.length === 0 && <tr><td colSpan={5} className="suave">Pátio vazio.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

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
