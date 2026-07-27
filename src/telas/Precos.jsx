import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { fmtHora, fmtBRL } from '../lib/tempo.js';

export default function Precos({ perfil }) {
  const [tabelas, setTabelas] = useState([]);
  const [sel, setSel] = useState(null); // tabela selecionada (edita faixas)
  const [erro, setErro] = useState('');

  async function carregar() {
    const { data, error } = await supabase.from('tabelas_preco')
      .select('*').is('vigencia_fim', null).order('tipo');
    if (error) setErro(error.message); else setTabelas(data);
  }
  useEffect(() => { carregar(); }, []);

  async function salvarHeader(t) {
    setErro('');
    const payload = {
      filial_id: perfil.filial_id, tipo: t.tipo, descricao: t.descricao,
      pernoite_ini: Number(t.pernoite_ini || 0),
      pernoite_fim: Number(t.pernoite_fim || 0), valor_diaria: Number(t.valor_diaria || 0),
      tolerancia_pct: Number(t.tolerancia_pct || 0), qte_pontos: Number(t.qte_pontos || 0),
      selecao_manual: !!t.selecao_manual,
    };
    const res = t.id
      ? await supabase.from('tabelas_preco').update(payload).eq('id', t.id)
      : await supabase.from('tabelas_preco').insert(payload);
    if (res.error) setErro(res.error.message); else { setSel(null); carregar(); }
  }

  return (
    <>
      <div className="card">
        <div className="card-cab">
          <div><h2>Tabelas de preço</h2>
            <p className="suave">Grade por tipo de veículo, com pernoite/diária e tolerância. As mudanças de preço deveriam entrar como nova vigência (histórico).</p></div>
          <button className="btn-primary" onClick={() => setSel({ novo: true })}>+ Nova tabela</button>
        </div>
        {erro && <div className="aviso">{erro}</div>}
        <div className="tabela-scroll">
          <table>
            <thead><tr><th>Tipo</th><th>Descrição</th><th>Pernoite</th><th>Diária</th><th>Tol.%</th><th>Seleção manual</th><th></th></tr></thead>
            <tbody>
              {tabelas.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.tipo}</td>
                  <td>{t.descricao}</td>
                  <td className="mono">{Number(t.pernoite_ini) ? `${fmtHora(Number(t.pernoite_ini))}–${fmtHora(Number(t.pernoite_fim))}` : '—'}</td>
                  <td>{fmtBRL(Number(t.valor_diaria))}</td>
                  <td>{Number(t.tolerancia_pct)}</td>
                  <td>{t.selecao_manual ? 'Sim' : 'Não'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-ghost" onClick={() => setSel(t)}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {sel && !sel.novo && <Faixas perfil={perfil} tabela={sel} />}
      {sel && (
        <HeaderModal inicial={sel.novo ? {} : sel} onSalvar={salvarHeader} onFechar={() => setSel(null)} />
      )}
    </>
  );
}

function HeaderModal({ inicial, onSalvar, onFechar }) {
  const [t, setT] = useState(inicial);
  const set = (k, v) => setT((o) => ({ ...o, [k]: v }));
  const campos = [
    ['tipo', 'Tipo (código)', 'text'], ['descricao', 'Descrição', 'text'],
    ['pernoite_ini', 'Início pernoite (HH.MM)', 'number'], ['pernoite_fim', 'Fim pernoite (HH.MM)', 'number'],
    ['valor_diaria', 'Valor da diária', 'number'], ['tolerancia_pct', 'Tolerância %', 'number'],
    ['qte_pontos', 'Pontos fidelidade', 'number'],
  ];
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t.id ? 'Editar' : 'Nova'} tabela de preço</h2>
        <form onSubmit={(e) => { e.preventDefault(); onSalvar(t); }}>
          {campos.map(([k, r, tp]) => (
            <div className="campo" key={k} style={{ marginBottom: 10 }}>
              <label>{r}</label>
              <input type={tp} step={tp === 'number' ? '0.01' : undefined}
                value={t[k] ?? ''} onChange={(e) => set(k, e.target.value)} required={k === 'tipo' || k === 'descricao'} />
            </div>
          ))}
          <label className="campo-check"><input type="checkbox" checked={!!t.selecao_manual} onChange={(e) => set('selecao_manual', e.target.checked)} /> Seleção manual na Entrada</label>
          <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
            <button type="submit" className="btn-primary">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Faixas({ perfil, tabela }) {
  const [faixas, setFaixas] = useState([]);
  const [nova, setNova] = useState({ ate: '', valor_hora: '', valor_convenio: '', tipo_cobranca: 'fixo' });

  async function carregar() {
    const { data } = await supabase.from('tabela_preco_faixas')
      .select('*').eq('tabela_preco_id', tabela.id).order('ordem');
    setFaixas(data || []);
  }
  useEffect(() => { carregar(); }, [tabela.id]);

  async function adicionar(e) {
    e.preventDefault();
    const ordem = (faixas.at(-1)?.ordem || 0) + 1;
    await supabase.from('tabela_preco_faixas').insert({
      filial_id: perfil.filial_id, tabela_preco_id: tabela.id, ordem,
      ate: Number(nova.ate), valor_hora: Number(nova.valor_hora), valor_convenio: Number(nova.valor_convenio || 0),
      tipo_cobranca: nova.tipo_cobranca,
    });
    setNova({ ate: '', valor_hora: '', valor_convenio: '', tipo_cobranca: 'fixo' });
    carregar();
  }
  async function excluir(id) { await supabase.from('tabela_preco_faixas').delete().eq('id', id); carregar(); }

  return (
    <div className="card">
      <h2>Faixas — {tabela.tipo} · {tabela.descricao}</h2>
      <p className="suave">
        "Fixo": valor cheio da faixa. "Por hora": <code>valor_hora</code> vira taxa por hora,
        cobrada a partir do teto da faixa anterior (fração arredonda pra cima).
      </p>
      <table>
        <thead><tr><th>Ordem</th><th>Até (HH.MM)</th><th>Tipo</th><th>Valor</th><th>Valor convênio</th><th></th></tr></thead>
        <tbody>
          {faixas.map((f) => (
            <tr key={f.id}>
              <td>{f.ordem}</td><td className="mono">{fmtHora(Number(f.ate))}</td>
              <td>{f.tipo_cobranca === 'hora' ? 'Por hora' : 'Fixo'}</td>
              <td>{fmtBRL(Number(f.valor_hora))}{f.tipo_cobranca === 'hora' ? '/h' : ''}</td>
              <td>{fmtBRL(Number(f.valor_convenio))}</td>
              <td style={{ textAlign: 'right' }}><button className="btn-ghost aviso-btn" onClick={() => excluir(f.id)}>Excluir</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="linha-form" onSubmit={adicionar} style={{ marginTop: 10 }}>
        <div className="campo"><label>Até (HH.MM)</label><input type="number" step="0.01" value={nova.ate} onChange={(e) => setNova({ ...nova, ate: e.target.value })} required /></div>
        <div className="campo">
          <label>Tipo</label>
          <select value={nova.tipo_cobranca} onChange={(e) => setNova({ ...nova, tipo_cobranca: e.target.value })}>
            <option value="fixo">Fixo</option>
            <option value="hora">Por hora</option>
          </select>
        </div>
        <div className="campo"><label>Valor</label><input type="number" step="0.01" value={nova.valor_hora} onChange={(e) => setNova({ ...nova, valor_hora: e.target.value })} required /></div>
        <div className="campo"><label>Valor convênio</label><input type="number" step="0.01" value={nova.valor_convenio} onChange={(e) => setNova({ ...nova, valor_convenio: e.target.value })} /></div>
        <button className="btn-primary" type="submit">+ Faixa</button>
      </form>
    </div>
  );
}
