import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { fmtBRL } from '../lib/tempo.js';
import { atualizarNotaFiscal } from '../lib/notaFiscal.js';

export default function Fiscal() {
  const [notas, setNotas] = useState([]);
  const [padrao, setPadrao] = useState('');
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [xml, setXml] = useState(null);
  const [retorno, setRetorno] = useState(null);
  const [enviando, setEnviando] = useState(null); // id da nota em envio
  const [consultando, setConsultando] = useState(null); // id da nota em consulta
  const [emLote, setEmLote] = useState(null); // { acao, feitos, total } enquanto roda em lote
  const [alterando, setAlterando] = useState(null); // nota em edição (formulário do modal)
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setErro('');
    const [{ data: n, error }, { data: f }] = await Promise.all([
      supabase.from('notas_fiscais').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('filiais').select('config').maybeSingle(),
    ]);
    if (error) setErro(error.message); else setNotas(n || []);
    setPadrao(f?.config?.nfse?.padrao || 'padrao_nacional_campinas');
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Assinatura (XMLDSig) + envio (mTLS) rodam nas funções do Vercel — elas
  // precisam do certificado, que nunca fica no navegador.
  async function chamarApi(rota, notaId) {
    const { data: sessao } = await supabase.auth.getSession();
    const resp = await fetch(rota, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.session?.access_token}` },
      body: JSON.stringify({ notaId }),
    });
    return { httpOk: resp.ok, httpStatus: resp.status, dados: await resp.json() };
  }

  async function enviar(notaId) {
    setErro(''); setMsg(''); setEnviando(notaId);
    try {
      const { httpOk, httpStatus, dados } = await chamarApi('/api/gerar-nfse', notaId);
      if (!httpOk) { setErro(dados.erro || `Falha ao enviar (${httpStatus}).`); return; }
      if (dados.ok && dados.status === 'enviada') setMsg(`Lote enviado — protocolo ${dados.protocolo}. Use "Consultar" pra saber se autorizou.`);
      else if (dados.ok) setMsg(`NFS-e autorizada — chave de acesso ${dados.chaveAcesso || '—'} (ambiente: ${dados.ambiente}).`);
      else setErro(dados.erro || `Rejeitada pelo governo (ambiente: ${dados.ambiente}) — veja o retorno na linha da nota.`);
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
      const { httpOk, httpStatus, dados } = await chamarApi('/api/consultar-nfse', notaId);
      if (!httpOk) { setErro(dados.erro || `Falha ao consultar (${httpStatus}).`); return; }
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

  function abrirAlteracao(n) {
    const t = n.tomador || {};
    setAlterando({
      id: n.id, numero_rps: n.numero_rps,
      competencia: n.competencia || '', valor: String(n.valor ?? ''), descricao: n.descricao || '',
      cpf_cnpj: t.cpf_cnpj || '', nome: t.nome || '', endereco: t.endereco || '', numero: t.numero || '',
      bairro: t.bairro || '', uf: t.uf || '', cep: t.cep || '', email: t.email || '', telefone: t.telefone || '',
    });
  }

  async function salvarAlteracao(e) {
    e.preventDefault();
    setErro(''); setMsg(''); setSalvando(true);
    const a = alterando;
    const { error } = await atualizarNotaFiscal(supabase, a.id, {
      competencia: a.competencia, valor: a.valor, descricao: a.descricao,
      tomador: {
        cpf_cnpj: a.cpf_cnpj, nome: a.nome, endereco: a.endereco, numero: a.numero,
        bairro: a.bairro, uf: a.uf, cep: a.cep, email: a.email, telefone: a.telefone,
      },
    });
    setSalvando(false);
    if (error) { setErro(error); return; }
    setAlterando(null);
    setMsg(`RPS ${a.numero_rps} alterado — XML regerado e protocolo limpo. Envie de novo quando quiser.`);
    carregar();
  }

  /**
   * Roda a mesma chamada pra uma fila de notas, uma de cada vez (o webservice
   * da prefeitura não gosta de rajada, e cada envio consome um número de RPS)
   * e resume no fim quantas deram certo. Não recarrega a lista a cada item —
   * só no final, pra tela não ficar piscando.
   */
  async function rodarEmLote(acao, fila, rota, ehSucesso) {
    setErro(''); setMsg('');
    setEmLote({ acao, feitos: 0, total: fila.length });
    let ok = 0;
    const falhas = [];
    for (const [i, nota] of fila.entries()) {
      try {
        const { httpOk, dados } = await chamarApi(rota, nota.id);
        if (httpOk && ehSucesso(dados)) ok++;
        else falhas.push(`RPS ${nota.numero_rps}: ${dados.erro || dados.status || 'falhou'}`);
      } catch (e) {
        falhas.push(`RPS ${nota.numero_rps}: ${e.message}`);
      }
      setEmLote({ acao, feitos: i + 1, total: fila.length });
    }
    setEmLote(null);
    setMsg(`${acao}: ${ok} de ${fila.length} com sucesso.`);
    if (falhas.length) setErro(`${falhas.length} com problema — ${falhas.slice(0, 5).join(' · ')}${falhas.length > 5 ? ' …' : ''}`);
    carregar();
  }

  const pendentesEnvio = notas.filter((n) => n.status === 'gerada' || n.status === 'erro');
  const pendentesConsulta = notas.filter((n) => n.status === 'enviada' && n.lote);
  const ehAbrasf = padrao === 'abrasf';

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
          <div className="linha-form">
            <button className="btn-primary" disabled={!!emLote || pendentesEnvio.length === 0}
              onClick={() => rodarEmLote('Enviar todos', pendentesEnvio, '/api/gerar-nfse', (d) => d.ok)}>
              {emLote?.acao === 'Enviar todos'
                ? `Enviando ${emLote.feitos}/${emLote.total}…`
                : `Enviar todos (${pendentesEnvio.length})`}
            </button>
            {/* Só no ABRASF: no Padrão Nacional o envio já volta autorizado
                (com a chave da NFS-e), sem protocolo pra consultar depois. */}
            {ehAbrasf && (
              <button className="btn-primary" disabled={!!emLote || pendentesConsulta.length === 0}
                onClick={() => rodarEmLote('Consultar todos', pendentesConsulta, '/api/consultar-nfse', (d) => d.status === 'autorizada')}>
                {emLote?.acao === 'Consultar todos'
                  ? `Consultando ${emLote.feitos}/${emLote.total}…`
                  : `Consultar todos (${pendentesConsulta.length})`}
              </button>
            )}
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
                    {n.status !== 'autorizada' && n.status !== 'cancelada' && (
                      <button className="btn-ghost" disabled={!!emLote} onClick={() => abrirAlteracao(n)}>Alterar</button>
                    )}
                    {(n.status === 'gerada' || n.status === 'erro') && (
                      <button className="btn-primary" disabled={enviando === n.id || !!emLote} onClick={() => enviar(n.id)}>
                        {enviando === n.id ? 'Enviando…' : (n.status === 'erro' ? 'Reenviar' : 'Enviar')}
                      </button>
                    )}
                    {n.status === 'enviada' && (
                      <button className="btn-primary" disabled={consultando === n.id || !!emLote} onClick={() => consultar(n.id)}>
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

      {alterando && (
        <div className="modal-bg" onClick={() => setAlterando(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520, maxHeight: '85vh', overflow: 'auto' }}>
            <h2>Alterar RPS/DPS {alterando.numero_rps}</h2>
            <p className="suave">
              Corrija os dados e grave: o XML é regerado e o protocolo é limpo, voltando a nota
              para "gerada" — aí é só enviar de novo. O número do RPS continua o mesmo (no ABRASF,
              reenviar o mesmo número é justamente como se retifica um RPS).
            </p>
            <form onSubmit={salvarAlteracao}>
              <div className="linha-form" style={{ marginBottom: 10 }}>
                <div className="campo" style={{ maxWidth: 160 }}>
                  <label>Competência</label>
                  <input type="date" value={alterando.competencia} required
                    onChange={(e) => setAlterando({ ...alterando, competencia: e.target.value })} />
                </div>
                <div className="campo" style={{ maxWidth: 120 }}>
                  <label>Valor</label>
                  <input type="number" step="0.01" min="0" value={alterando.valor} required
                    onChange={(e) => setAlterando({ ...alterando, valor: e.target.value })} />
                </div>
              </div>
              <div className="campo" style={{ marginBottom: 10 }}>
                <label>Descrição do serviço</label>
                <input value={alterando.descricao}
                  onChange={(e) => setAlterando({ ...alterando, descricao: e.target.value })} />
              </div>

              <h3 style={{ marginBottom: 4 }}>Tomador</h3>
              <div className="linha-form" style={{ marginBottom: 10 }}>
                <div className="campo" style={{ maxWidth: 180 }}>
                  <label>CPF/CNPJ</label>
                  <input className="mono" value={alterando.cpf_cnpj}
                    onChange={(e) => setAlterando({ ...alterando, cpf_cnpj: e.target.value })} />
                </div>
                <div className="campo" style={{ flex: 1 }}>
                  <label>Nome / Razão social</label>
                  <input value={alterando.nome}
                    onChange={(e) => setAlterando({ ...alterando, nome: e.target.value })} />
                </div>
              </div>
              <div className="linha-form" style={{ marginBottom: 10 }}>
                <div className="campo" style={{ flex: 2 }}>
                  <label>Endereço</label>
                  <input value={alterando.endereco}
                    onChange={(e) => setAlterando({ ...alterando, endereco: e.target.value })} />
                </div>
                <div className="campo" style={{ width: 90 }}>
                  <label>Número</label>
                  <input value={alterando.numero}
                    onChange={(e) => setAlterando({ ...alterando, numero: e.target.value })} />
                </div>
              </div>
              <div className="linha-form" style={{ marginBottom: 10 }}>
                <div className="campo" style={{ flex: 1 }}>
                  <label>Bairro</label>
                  <input value={alterando.bairro}
                    onChange={(e) => setAlterando({ ...alterando, bairro: e.target.value })} />
                </div>
                <div className="campo" style={{ width: 70 }}>
                  <label>UF</label>
                  <input className="mono" maxLength={2} style={{ textTransform: 'uppercase' }} value={alterando.uf}
                    onChange={(e) => setAlterando({ ...alterando, uf: e.target.value.toUpperCase() })} />
                </div>
                <div className="campo" style={{ width: 120 }}>
                  <label>CEP</label>
                  <input className="mono" value={alterando.cep}
                    onChange={(e) => setAlterando({ ...alterando, cep: e.target.value })} />
                </div>
              </div>
              <div className="linha-form" style={{ marginBottom: 10 }}>
                <div className="campo" style={{ flex: 1 }}>
                  <label>E-mail</label>
                  <input value={alterando.email}
                    onChange={(e) => setAlterando({ ...alterando, email: e.target.value })} />
                </div>
                <div className="campo" style={{ width: 150 }}>
                  <label>Telefone</label>
                  <input value={alterando.telefone}
                    onChange={(e) => setAlterando({ ...alterando, telefone: e.target.value })} />
                </div>
              </div>

              <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="btn-ghost" onClick={() => setAlterando(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={salvando}>
                  {salvando ? 'Gravando…' : 'Gravar e limpar protocolo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
