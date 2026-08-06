import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { fmtBRL } from '../lib/tempo.js';

export default function Fiscal() {
  const [notas, setNotas] = useState([]);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [xml, setXml] = useState(null);
  const [retorno, setRetorno] = useState(null);
  const [enviando, setEnviando] = useState(null); // id da nota em envio
  const [consultando, setConsultando] = useState(null); // id da nota em consulta

  const carregar = useCallback(async () => {
    setErro('');
    const { data: n, error } = await supabase.from('notas_fiscais').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) setErro(error.message); else setNotas(n || []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

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

  // ABRASF é assíncrono: "Enviar" só entrega o protocolo do lote (status
  // "enviada"); a nota (ou o erro) sai aqui, consultando o protocolo depois.
  async function consultar(notaId) {
    setErro(''); setMsg(''); setConsultando(notaId);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const resp = await fetch('/api/consultar-nfse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.session?.access_token}` },
        body: JSON.stringify({ notaId }),
      });
      const dados = await resp.json();
      if (!resp.ok) { setErro(dados.erro || `Falha ao consultar (${resp.status}).`); return; }
      if (dados.status === 'autorizada') setMsg(`NFS-e autorizada — número ${dados.numeroNfse} (ambiente: ${dados.ambiente}).`);
      else if (dados.status === 'erro') setErro(`Rejeitada pelo governo (ambiente: ${dados.ambiente}) — veja o retorno na linha da nota.`);
      else if (dados.status === 'falha_consulta') setErro(`Falha ao consultar: ${dados.erro}`);
      else setMsg('Ainda em processamento na prefeitura — tente consultar de novo em instantes.');
    } catch (e) {
      setErro(`Falha ao contatar o serviço de consulta: ${e.message}`);
    } finally {
      setConsultando(null);
      carregar();
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-cab">
          <div>
            <h2>NFS-e / RPS/DPS</h2>
            <p className="suave">
              Documentos gerados na saída do veículo ou no recebimento de mensalidade (menu ⋮ →
              "Gerar DPS"). "Enviar" assina e transmite no padrão configurado em Configurações →
              Fiscal. No ABRASF o envio é assíncrono: primeiro sai um protocolo (status "enviada"),
              depois é preciso "Consultar" pra saber se autorizou.
            </p>
          </div>
        </div>
        {erro && <div className="aviso">{erro}{erro.includes('notas_fiscais') && ' — rode a migration 0005_fiscal.sql.'}</div>}
        {msg && <div className="ok-txt">{msg}</div>}
      </div>

      <div className="card">
        <h2>Documentos ({notas.length})</h2>
        <div className="tabela-scroll">
          <table>
            <thead><tr><th>RPS/DPS</th><th>Série</th><th>Competência</th><th>Valor</th><th>ISS</th><th>Status</th><th>Chave/NFS-e</th><th></th></tr></thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id}>
                  <td className="mono">{n.numero_rps}</td><td>{n.serie}</td><td>{n.competencia}</td>
                  <td>{fmtBRL(Number(n.valor))}</td><td>{fmtBRL(Number(n.valor_iss))}</td>
                  <td><span className={'status status-' + n.status}>{n.status}</span></td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {n.numero_nfse || (n.status === 'enviada' && n.lote ? `protocolo ${n.lote}` : '—')}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn-ghost" onClick={() => setXml(n.xml)}>XML</button>
                    {n.retorno && <button className="btn-ghost" onClick={() => setRetorno(n.retorno)}>Retorno</button>}
                    {(n.status === 'gerada' || n.status === 'erro') && (
                      <button className="btn-primary" disabled={enviando === n.id} onClick={() => enviar(n.id)}>
                        {enviando === n.id ? 'Enviando…' : (n.status === 'erro' ? 'Reenviar' : 'Enviar')}
                      </button>
                    )}
                    {n.status === 'enviada' && (
                      <button className="btn-primary" disabled={consultando === n.id} onClick={() => consultar(n.id)}>
                        {consultando === n.id ? 'Consultando…' : 'Consultar'}
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
            <h2>XML do RPS/DPS</h2>
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
            <h2>Retorno do governo</h2>
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
