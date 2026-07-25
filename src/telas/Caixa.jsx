import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { fmtBRL } from '../lib/tempo.js';

export default function Caixa({ perfil }) {
  const [caixa, setCaixa] = useState(null);
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState('');
  const [abertura, setAbertura] = useState('0');
  const [sangria, setSangria] = useState({ valor: '', motivo: '' });
  const [contado, setContado] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    const { data: c, error } = await supabase.from('caixas').select('*')
      .eq('operador_id', perfil.id).eq('status', 'aberto').maybeSingle();
    if (error) { setErro(error.message); return; }
    setCaixa(c);
    if (!c) { setResumo(null); return; }

    const [{ data: movs }, { data: sangrias }, { data: formas }] = await Promise.all([
      supabase.from('movimentos').select('id,valor').eq('caixa_id', c.id).not('dt_saida', 'is', null),
      supabase.from('sangrias').select('valor').eq('caixa_id', c.id),
      supabase.from('formas_pagamento').select('codigo,eh_dinheiro'),
    ]);
    const dinheiroCods = new Set((formas || []).filter((f) => f.eh_dinheiro).map((f) => f.codigo));
    let dinheiro = 0, total = 0;
    const ids = (movs || []).map((m) => m.id);
    total = (movs || []).reduce((s, m) => s + Number(m.valor || 0), 0);
    if (ids.length) {
      const { data: pg } = await supabase.from('movimento_pagamentos').select('*').in('movimento_id', ids);
      dinheiro = (pg || []).filter((p) => dinheiroCods.has(p.forma_pagamento)).reduce((s, p) => s + Number(p.valor || 0), 0);
    }
    const totalSangria = (sangrias || []).reduce((s, x) => s + Number(x.valor || 0), 0);
    setResumo({
      qtd: (movs || []).length, total, dinheiro, sangrias: totalSangria,
      esperadoCaixa: Number(c.valor_abertura) + dinheiro - totalSangria,
    });
  }, [perfil.id]);

  useEffect(() => { carregar(); }, [carregar]);

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
    const { error } = await supabase.from('caixas').update({
      status: 'fechado', fechado_em: new Date().toISOString(), valor_fechamento: Number(contado || 0),
    }).eq('id', caixa.id);
    if (error) setErro(error.message); else { setContado(''); carregar(); }
  }

  if (erro) return <div className="card aviso">{erro}<p className="suave">Se a tabela não existir, rode a migration 0003_caixa.sql.</p></div>;

  if (!caixa) return (
    <div className="card" style={{ maxWidth: 460 }}>
      <h2>Abrir caixa</h2>
      <p className="suave">Nenhum caixa aberto para você. Informe o troco inicial.</p>
      <div className="campo" style={{ marginBottom: 12 }}>
        <label>Troco de abertura</label>
        <input type="number" step="0.01" value={abertura} onChange={(e) => setAbertura(e.target.value)} />
      </div>
      <button className="btn-primary" onClick={abrir}>Abrir caixa</button>
    </div>
  );

  const dif = resumo ? Number(contado || 0) - resumo.esperadoCaixa : 0;

  return (
    <>
      <div className="card">
        <div className="card-cab">
          <div><h2>Caixa aberto</h2><p className="suave">Desde {new Date(caixa.aberto_em).toLocaleString('pt-BR')}</p></div>
        </div>
        {resumo && (
          <div className="kpis">
            <Kpi rotulo="Saídas no turno" valor={resumo.qtd} />
            <Kpi rotulo="Faturado" valor={fmtBRL(resumo.total)} />
            <Kpi rotulo="Em dinheiro" valor={fmtBRL(resumo.dinheiro)} />
            <Kpi rotulo="Sangrias" valor={fmtBRL(resumo.sangrias)} />
            <Kpi rotulo="Esperado no caixa" valor={fmtBRL(resumo.esperadoCaixa)} destaque />
          </div>
        )}
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
        <button className="btn-primary" onClick={fechar}>Fechar caixa</button>
      </div>
    </>
  );
}

function Kpi({ rotulo, valor, destaque }) {
  return <div className={'kpi' + (destaque ? ' destaque' : '')}><div className="kpi-rotulo">{rotulo}</div><div className="kpi-valor">{valor}</div></div>;
}
