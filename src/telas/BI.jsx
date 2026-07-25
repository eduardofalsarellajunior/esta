import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { hojeISO, fmtBRL, fmtHora } from '../lib/tempo.js';

export default function BI({ perfil }) {
  const [de, setDe] = useState(hojeISO());
  const [ate, setAte] = useState(hojeISO());
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

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
    let faturamento = 0, tabelaCheia = 0, tempoTotal = 0, saidasComTempo = 0;
    for (const m of movs) {
      porTipo[m.tipo_mens] = (porTipo[m.tipo_mens] || 0) + 1;
      faturamento += Number(m.valor || 0);
      tabelaCheia += Number(m.valor_proporcional || 0);
      if (m.hr_saida != null && m.hr_entrada != null) { tempoTotal += Number(m.hr_saida) - Number(m.hr_entrada); saidasComTempo++; }
    }
    const porForma = {};
    for (const p of pagtos) {
      const k = descForma[p.forma_pagamento] || p.forma_pagamento;
      porForma[k] = (porForma[k] || 0) + Number(p.valor || 0);
    }
    setDados({
      totalVeic: movs.length, faturamento, tabelaCheia, descontos: tabelaCheia - faturamento,
      porTipo, porForma, tempoMedio: saidasComTempo ? tempoTotal / saidasComTempo : 0,
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
