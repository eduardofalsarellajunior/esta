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
  const [retorno, setRetorno] = useState(null);
  const [enviando, setEnviando] = useState(null); // id da nota em envio
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
    setMsg(`${n} RPS gerado(s). Use "Enviar" pra assinar e transmitir pro governo.`);
    carregar();
  }

  // Assinatura (XMLDSig) + envio (mTLS) rodam em api/gerar-nfse.js (Node, no
  // Vercel) — precisam do certificado, que nunca fica no navegador.
  async function enviar(notaId) {
    setErro(''); setMsg(''); setEnviando(notaId);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const resp = await fetch('/api/gerar-nfse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.session?.access_token}` },
        body: JSON.stringify({ notaId }),
      });
      const dados = await resp.json();
      if (!resp.ok) { setErro(dados.erro || `Falha ao enviar (${resp.status}).`); return; }
      if (dados.ok) setMsg(`NFS-e autorizada — chave de acesso ${dados.chaveAcesso || '—'} (ambiente: ${dados.ambiente}).`);
      else setErro(`Rejeitada pelo governo (ambiente: ${dados.ambiente}) — veja o retorno na linha da nota.`);
    } catch (e) {
      setErro(`Falha ao contatar o serviço de envio: ${e.message}`);
    } finally {
      setEnviando(null);
      carregar();
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-cab">
          <div>
            <h2>NFS-e / RPS — Padrão Nacional</h2>
            <p className="suave">Gera o DPS dos movimentos cobrados. "Enviar" assina e transmite pro Sistema Nacional NFS-e.</p>
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
            <thead><tr><th>RPS</th><th>Série</th><th>Competência</th><th>Valor</th><th>ISS</th><th>Status</th><th>Chave/NFS-e</th><th></th></tr></thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id}>
                  <td className="mono">{n.numero_rps}</td><td>{n.serie}</td><td>{n.competencia}</td>
                  <td>{fmtBRL(Number(n.valor))}</td><td>{fmtBRL(Number(n.valor_iss))}</td>
                  <td><span className={'status status-' + n.status}>{n.status}</span></td>
                  <td className="mono" style={{ fontSize: 11 }}>{n.numero_nfse || '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn-ghost" onClick={() => setXml(n.xml)}>XML</button>
                    {n.retorno && <button className="btn-ghost" onClick={() => setRetorno(n.retorno)}>Retorno</button>}
                    {(n.status === 'gerada' || n.status === 'erro') && (
                      <button className="btn-primary" disabled={enviando === n.id} onClick={() => enviar(n.id)}>
                        {enviando === n.id ? 'Enviando…' : (n.status === 'erro' ? 'Reenviar' : 'Enviar')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {notas.length === 0 && <tr><td colSpan={8} className="suave">Nenhum documento.</td></tr>}
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

      {retorno && (
        <div className="modal-bg" onClick={() => setRetorno(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640, maxHeight: '80vh', overflow: 'auto' }}>
            <h2>Retorno da ADN</h2>
            <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{retorno}</pre>
            <div className="linha-form" style={{ justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setRetorno(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
