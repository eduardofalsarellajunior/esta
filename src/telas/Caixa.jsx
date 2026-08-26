import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { fmtBRL } from '../lib/tempo.js';
import { carregarRelatorioCaixa, imprimirRelatorioCaixa } from '../lib/caixaRelatorio.js';
import { ehGerente } from '../lib/acesso.js';

export default function Caixa({ perfil }) {
  const [caixa, setCaixa] = useState(null);
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState('');
  const [abertura, setAbertura] = useState('0');
  const [sangria, setSangria] = useState({ valor: '', motivo: '' });
  const [contado, setContado] = useState('');
  const [filial, setFilial] = useState(null); // cabeçalho do relatório impresso
  const [caixaFechado, setCaixaFechado] = useState(null); // caixa recém-fechado — oferece "Imprimir relatório"
  const [historico, setHistorico] = useState([]);
  const [imprimindo, setImprimindo] = useState(null); // id do caixa sendo carregado pra impressão

  useEffect(() => {
    supabase.from('filiais').select('nome_fantasia, cnpj').eq('id', perfil.filial_id).maybeSingle()
      .then(({ data }) => setFilial(data));
  }, [perfil.filial_id]);

  const carregar = useCallback(async () => {
    setErro('');
    const { data: c, error } = await supabase.from('caixas').select('*')
      .eq('operador_id', perfil.id).eq('status', 'aberto').maybeSingle();
    if (error) { setErro(error.message); return; }
    setCaixa(c);
    if (!c) { setResumo(null); return; }

    const [{ data: movs }, { data: sangrias }, { data: formas }, { data: mensPagtos }, { data: antecipadosEntrada }, { data: antecipadosReserva }, { data: vendasProdutos }] = await Promise.all([
      supabase.from('movimentos').select('id,valor').eq('caixa_id', c.id).not('dt_saida', 'is', null),
      supabase.from('sangrias').select('valor').eq('caixa_id', c.id),
      supabase.from('formas_pagamento').select('codigo,eh_dinheiro'),
      // Mensalidades recebidas neste turno (Mensalistas → Receber).
      supabase.from('mensalista_pagamentos').select('valor_pago,forma_pagamento').eq('caixa_id', c.id),
      // Valores antecipados recebidos na ENTRADA neste turno (ver 0039_valor_antecipado.sql)
      // — ligados direto pelo próprio caixa_id do pagamento, não pelo do movimento
      // (que só é gravado na saída, podendo ser um turno diferente).
      supabase.from('movimento_pagamentos').select('valor,forma_pagamento').eq('caixa_id', c.id),
      // Valores antecipados recebidos ao CRIAR UMA RESERVA neste turno (ver
      // 0040_reserva_antecipado.sql) — mesmo raciocínio, caixa_id próprio.
      supabase.from('reservas').select('valor_antecipado,forma_antecipado').eq('caixa_id_antecipado', c.id),
      // Vendas de produto (balcão) neste turno (ver 0042_produtos.sql) — nunca
      // passa por movimentos/notas_fiscais, caixa_id próprio igual antecipado.
      supabase.from('vendas_produtos').select('valor_total,forma_pagamento').eq('caixa_id', c.id),
    ]);
    const dinheiroCods = new Set((formas || []).filter((f) => f.eh_dinheiro).map((f) => f.codigo));
    let dinheiroSaidas = 0, total = 0;
    const ids = (movs || []).map((m) => m.id);
    total = (movs || []).reduce((s, m) => s + Number(m.valor || 0), 0);
    if (ids.length) {
      // Só pagamento de saída (caixa_id null) — o de antecipado tem o
      // próprio caixa_id e já é somado à parte (`antecipados` abaixo), senão
      // contaria o mesmo dinheiro duas vezes se saída e entrada caíssem no
      // mesmo turno.
      const { data: pg } = await supabase.from('movimento_pagamentos').select('*').in('movimento_id', ids).is('caixa_id', null);
      dinheiroSaidas = (pg || []).filter((p) => dinheiroCods.has(p.forma_pagamento)).reduce((s, p) => s + Number(p.valor || 0), 0);
    }
    const mensalidades = (mensPagtos || []).reduce((s, p) => s + Number(p.valor_pago || 0), 0);
    const dinheiroMensalidades = (mensPagtos || [])
      .filter((p) => dinheiroCods.has(p.forma_pagamento))
      .reduce((s, p) => s + Number(p.valor_pago || 0), 0);
    // Antecipado feito na entrada (movimento_pagamentos) + antecipado feito
    // ao criar a reserva (reservas) — mesma natureza (dinheiro recebido
    // antes da hora, contado neste turno), somados num "Antecipados" só.
    const reservasAntecip = (antecipadosReserva || []).filter((r) => Number(r.valor_antecipado) > 0);
    const antecipadosTotal = (antecipadosEntrada || []).reduce((s, p) => s + Number(p.valor || 0), 0)
      + reservasAntecip.reduce((s, r) => s + Number(r.valor_antecipado), 0);
    const dinheiroAntecipados = (antecipadosEntrada || [])
      .filter((p) => dinheiroCods.has(p.forma_pagamento))
      .reduce((s, p) => s + Number(p.valor || 0), 0)
      + reservasAntecip.filter((r) => dinheiroCods.has(r.forma_antecipado))
        .reduce((s, r) => s + Number(r.valor_antecipado), 0);
    const produtosTotal = (vendasProdutos || []).reduce((s, v) => s + Number(v.valor_total || 0), 0);
    const dinheiroProdutos = (vendasProdutos || [])
      .filter((v) => dinheiroCods.has(v.forma_pagamento))
      .reduce((s, v) => s + Number(v.valor_total || 0), 0);
    const dinheiro = dinheiroSaidas + dinheiroMensalidades + dinheiroAntecipados + dinheiroProdutos;
    const totalSangria = (sangrias || []).reduce((s, x) => s + Number(x.valor || 0), 0);
    setResumo({
      qtd: (movs || []).length, total, dinheiro, sangrias: totalSangria,
      qtdMensalidades: (mensPagtos || []).length, mensalidades,
      qtdAntecipados: (antecipadosEntrada || []).length + reservasAntecip.length, antecipados: antecipadosTotal,
      qtdProdutos: (vendasProdutos || []).length, produtos: produtosTotal,
      esperadoCaixa: Number(c.valor_abertura) + dinheiro - totalSangria,
    });
  }, [perfil.id]);

  const carregarHistorico = useCallback(async () => {
    // Cada um vê os próprios caixas fechados; gerente/supervisor/fornecedor
    // vê os de todo mundo na filial (RLS já isola por filial — aqui é só
    // decidir se restringe também por operador).
    let q = supabase.from('caixas').select('*, perfis(nome)').eq('status', 'fechado')
      .order('numero', { ascending: false }).limit(30);
    if (!ehGerente(perfil)) q = q.eq('operador_id', perfil.id);
    const { data, error } = await q;
    if (error) { setErro(error.message); return; }
    setHistorico(data || []);
  }, [perfil]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { carregarHistorico(); }, [carregarHistorico]);

  async function abrir() {
    const { error } = await supabase.from('caixas').insert({
      filial_id: perfil.filial_id, operador_id: perfil.id, valor_abertura: Number(abertura || 0),
    });
    if (error) setErro(error.message); else carregar();
  }
  async function lancarSangria(e) {
    e.preventDefault();
    const { error } = await supabase.from('sangrias').insert({
      filial_id: perfil.filial_id, caixa_id: caixa.id, operador_id: perfil.id,
      valor: Number(sangria.valor), motivo: sangria.motivo,
    });
    if (error) setErro(error.message); else { setSangria({ valor: '', motivo: '' }); carregar(); }
  }
  async function fechar() {
    if (!window.confirm('Fechar o caixa deste turno?')) return;
    const { data: fechado, error } = await supabase.from('caixas').update({
      status: 'fechado', fechado_em: new Date().toISOString(), valor_fechamento: Number(contado || 0),
    }).eq('id', caixa.id).select().single();
    if (error) { setErro(error.message); return; }
    setContado('');
    setCaixaFechado(fechado);
    carregar();
    carregarHistorico();
  }

  async function imprimir(c, reimpressao = false) {
    setErro(''); setImprimindo(c.id);
    try {
      const dados = await carregarRelatorioCaixa(c);
      imprimirRelatorioCaixa(dados, filial, reimpressao);
    } catch (e) {
      setErro(e.message);
    } finally {
      setImprimindo(null);
    }
  }

  if (erro) return <div className="card aviso">{erro}<p className="suave">Se a tabela não existir, rode a migration 0003_caixa.sql.</p></div>;

  if (!caixa) return (
    <>
      {caixaFechado && (
        <div className="card" style={{ maxWidth: 460, borderColor: 'var(--ok)' }}>
          <h2>Caixa Nº {caixaFechado.numero} fechado</h2>
          <p className="ok-txt">Turno encerrado com sucesso.</p>
          <div className="linha-form" style={{ justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => setCaixaFechado(null)}>Fechar aviso</button>
            <button className="btn-primary" disabled={imprimindo === caixaFechado.id} onClick={() => imprimir(caixaFechado)}>
              {imprimindo === caixaFechado.id ? 'Gerando…' : 'Imprimir relatório'}
            </button>
          </div>
        </div>
      )}
      <div className="card" style={{ maxWidth: 460 }}>
        <h2>Abrir caixa</h2>
        <p className="suave">Nenhum caixa aberto para você. Informe o troco inicial.</p>
        <div className="campo" style={{ marginBottom: 12 }}>
          <label>Troco de abertura</label>
          <input type="number" step="0.01" value={abertura} onChange={(e) => setAbertura(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={abrir}>Abrir caixa</button>
      </div>
      <HistoricoCaixas historico={historico} imprimindo={imprimindo} onImprimir={imprimir} vendoTodos={ehGerente(perfil)} />
    </>
  );

  const dif = resumo ? Number(contado || 0) - resumo.esperadoCaixa : 0;

  return (
    <>
      <div className="card">
        <div className="card-cab">
          <div>
            <h2>Caixa Nº {caixa.numero} aberto</h2>
            <p className="suave">
              Desde {new Date(caixa.aberto_em).toLocaleString('pt-BR')}
              {' · Troco de abertura: '}<strong>{fmtBRL(Number(caixa.valor_abertura || 0))}</strong>
            </p>
          </div>
        </div>
        {resumo && (
          <div className="kpis">
            <Kpi rotulo="Saídas no turno" valor={resumo.qtd} />
            <Kpi rotulo="Faturado (saídas)" valor={fmtBRL(resumo.total)} />
            <Kpi rotulo={`Mensalidades (${resumo.qtdMensalidades})`} valor={fmtBRL(resumo.mensalidades)} />
            <Kpi rotulo={`Antecipados (${resumo.qtdAntecipados})`} valor={fmtBRL(resumo.antecipados)} />
            <Kpi rotulo={`Venda de produtos (${resumo.qtdProdutos})`} valor={fmtBRL(resumo.produtos)} />
            <Kpi rotulo="Total do turno" valor={fmtBRL(resumo.total + resumo.mensalidades + resumo.antecipados + resumo.produtos)} />
            <Kpi rotulo="Em dinheiro" valor={fmtBRL(resumo.dinheiro)} />
            <Kpi rotulo="Sangrias" valor={fmtBRL(resumo.sangrias)} />
            <Kpi rotulo="Esperado no caixa" valor={fmtBRL(resumo.esperadoCaixa)} destaque />
          </div>
        )}
        <p className="suave">
          "Em dinheiro" e "Esperado no caixa" já incluem as mensalidades, os valores antecipados e
          as vendas de produtos recebidos neste turno.
        </p>
      </div>

      <div className="card" style={{ maxWidth: 460 }}>
        <h2>Sangria</h2>
        <form className="linha-form" onSubmit={lancarSangria}>
          <div className="campo"><label>Valor</label><input type="number" step="0.01" value={sangria.valor} onChange={(e) => setSangria({ ...sangria, valor: e.target.value })} required /></div>
          <div className="campo"><label>Motivo</label><input value={sangria.motivo} onChange={(e) => setSangria({ ...sangria, motivo: e.target.value })} /></div>
          <button className="btn-primary" type="submit">Registrar</button>
        </form>
      </div>

      <div className="card" style={{ maxWidth: 460 }}>
        <h2>Fechamento</h2>
        <div className="campo" style={{ marginBottom: 8 }}>
          <label>Dinheiro contado</label>
          <input type="number" step="0.01" value={contado} onChange={(e) => setContado(e.target.value)} />
        </div>
        {contado !== '' && (
          <p className={Math.abs(dif) < 0.005 ? 'ok-txt' : 'aviso'}>
            Diferença: {fmtBRL(dif)} {Math.abs(dif) < 0.005 ? '(fechado certo)' : dif > 0 ? '(sobra)' : '(falta)'}
          </p>
        )}
        <p className="suave" style={{ fontSize: 11 }}>
          Depois de fechar, o relatório fica pronto pra imprimir (bobina de 58mm) — dá pra
          reimprimir a qualquer momento na lista de "Caixas fechados" abaixo.
        </p>
        <button className="btn-primary" onClick={fechar}>Fechar caixa</button>
      </div>

      <HistoricoCaixas historico={historico} imprimindo={imprimindo} onImprimir={imprimir} vendoTodos={ehGerente(perfil)} />
    </>
  );
}

function HistoricoCaixas({ historico, imprimindo, onImprimir, vendoTodos }) {
  return (
    <div className="card">
      <h2>Caixas fechados</h2>
      <p className="suave">
        {vendoTodos ? 'Últimos 30 turnos fechados na filial, de todos os operadores.' : 'Seus últimos 30 turnos fechados.'}
      </p>
      <div className="tabela-scroll">
        <table>
          <thead><tr>
            <th>Nº</th>{vendoTodos && <th>Operador</th>}<th>Aberto em</th><th>Fechado em</th><th>Contado</th><th></th>
          </tr></thead>
          <tbody>
            {historico.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.numero}</td>
                {vendoTodos && <td>{c.perfis?.nome || '—'}</td>}
                <td className="mono">{new Date(c.aberto_em).toLocaleString('pt-BR')}</td>
                <td className="mono">{c.fechado_em ? new Date(c.fechado_em).toLocaleString('pt-BR') : '—'}</td>
                <td>{fmtBRL(Number(c.valor_fechamento || 0))}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-ghost" disabled={imprimindo === c.id} onClick={() => onImprimir(c, true)}>
                    {imprimindo === c.id ? 'Gerando…' : 'Imprimir relatório'}
                  </button>
                </td>
              </tr>
            ))}
            {historico.length === 0 && <tr><td colSpan={vendoTodos ? 6 : 5} className="suave">Nenhum caixa fechado ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ rotulo, valor, destaque }) {
  return <div className={'kpi' + (destaque ? ' destaque' : '')}><div className="kpi-rotulo">{rotulo}</div><div className="kpi-valor">{valor}</div></div>;
}
