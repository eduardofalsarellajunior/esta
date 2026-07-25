import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { hojeISO, fmtBRL } from '../lib/tempo.js';
import { gerarXmlDPS, proximoNumeroRps } from '../lib/fiscal.js';

export default function Fiscal({ perfil }) {
  const [notas, setNotas] = useState([]);
  const [filial, setFilial] = useState(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [xml, setXml] = useState(null);
  const [de, setDe] = useState(hojeISO());
  const [ate, setAte] = useState(hojeISO());

  const carregar = useCallback(async () => {
    setErro('');
    const [{ data: n, error }, { data: f }] = await Promise.all([
      supabase.from('notas_fiscais').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('filiais').select('*').maybeSingle(),
    ]);
    if (error) setErro(error.message); else setNotas(n || []);
    setFilial(f);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function gerarDoPeriodo() {
    setMsg(''); setErro('');
    // Movimentos com valor > 0, com saída no período e ainda sem nota.
    const { data: movs, error } = await supabase.from('movimentos').select('*')
      .gte('dt_saida', de).lte('dt_saida', ate).not('dt_saida', 'is', null).gt('valor', 0);
    if (error) { setErro(error.message); return; }
    const { data: existentes } = await supabase.from('notas_fiscais').select('movimento_id');
    const jaTem = new Set((existentes || []).map((x) => x.movimento_id));
    const pendentes = (movs || []).filter((m) => !jaTem.has(m.id));
    if (!pendentes.length) { setMsg('Nenhum movimento novo para gerar RPS.'); return; }

    const cfg = filial?.config?.nfse || {};
    const serie = cfg.serie || '1';
    let n = 0;
    for (const m of pendentes) {
      const numero = await proximoNumeroRps(supabase, perfil.filial_id, serie);
      const nota = {
        filial_id: perfil.filial_id, movimento_id: m.id, numero_rps: numero, serie,
        competencia: m.dt_saida, descricao: 'Estacionamento de veículo',
        valor: Number(m.valor), aliquota_iss: Number(cfg.perc_iss || 0),
        valor_iss: Number((Number(m.valor) * Number(cfg.perc_iss || 0) / 100).toFixed(2)),
        tomador: {}, status: 'gerada',
      };
      nota.xml = gerarXmlDPS({ nota, filial });
      const { error: e2 } = await supabase.from('notas_fiscais').insert(nota);
      if (e2) { setErro(e2.message); break; }
      n++;
    }
    setMsg(`${n} RPS gerado(s). Assinatura e transmissão são etapas externas (certificado).`);
    carregar();
  }

  return (
    <>
      <div className="card">
        <div className="card-cab">
          <div>
            <h2>NFS-e / RPS — Padrão Nacional</h2>
            <p className="suave">Gera o RPS dos movimentos cobrados. A assinatura digital e o envio ao município exigem certificado (integração externa).</p>
          </div>
          <div className="linha-form">
            <div className="campo"><label>De</label><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
            <div className="campo"><label>Até</label><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
            <button className="btn-primary" onClick={gerarDoPeriodo}>Gerar RPS do período</button>
          </div>
        </div>
        {erro && <div className="aviso">{erro}{erro.includes('notas_fiscais') && ' — rode a migration 0005_fiscal.sql.'}</div>}
        {msg && <div className="ok-txt">{msg}</div>}
      </div>

      <div className="card">
        <h2>Documentos ({notas.length})</h2>
        <div className="tabela-scroll">
          <table>
            <thead><tr><th>RPS</th><th>Série</th><th>Competência</th><th>Valor</th><th>ISS</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id}>
                  <td className="mono">{n.numero_rps}</td><td>{n.serie}</td><td>{n.competencia}</td>
                  <td>{fmtBRL(Number(n.valor))}</td><td>{fmtBRL(Number(n.valor_iss))}</td>
                  <td><span className={'status status-' + n.status}>{n.status}</span></td>
                  <td style={{ textAlign: 'right' }}><button className="btn-ghost" onClick={() => setXml(n.xml)}>XML</button></td>
                </tr>
              ))}
              {notas.length === 0 && <tr><td colSpan={7} className="suave">Nenhum documento.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {xml && (
        <div className="modal-bg" onClick={() => setXml(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640, maxHeight: '80vh', overflow: 'auto' }}>
            <h2>XML do RPS (DPS)</h2>
            <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{xml}</pre>
            <div className="linha-form" style={{ justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setXml(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
