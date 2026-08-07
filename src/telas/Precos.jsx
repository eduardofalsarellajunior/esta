import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { fmtHora, fmtBRL } from '../lib/tempo.js';

export default function Precos({ perfil }) {
  const [tabelas, setTabelas] = useState([]);
  const [sel, setSel] = useState(null); // tabela cujas faixas aparecem embaixo
  const [editando, setEditando] = useState(null); // objeto no modal de cabeçalho (null = fechado)
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
      qte_pontos: Number(t.qte_pontos || 0),
      selecao_manual: !!t.selecao_manual,
    };
    const res = t.id
      ? await supabase.from('tabelas_preco').update(payload).eq('id', t.id).select().single()
      : await supabase.from('tabelas_preco').insert(payload).select().single();
    if (res.error) { setErro(res.error.message); return; }
    // Fecha só o cabeçalho; mantém a tabela selecionada pra editar as faixas na hora.
    setEditando(null); setSel(res.data); carregar();
  }

  async function excluirTabela(id) {
    if (!window.confirm('Excluir esta tabela de preço? Isso também apaga as faixas dela e não pode ser desfeito.')) return;
    setErro('');
    const { error } = await supabase.from('tabelas_preco').delete().eq('id', id);
    if (error) { setErro(error.message); return; }
    setEditando(null); setSel(null); carregar();
  }

  return (
    <>
      <div className="card">
        <div className="card-cab">
          <div><h2>Tabelas de preço</h2>
            <p className="suave">Grade por tipo de veículo. As mudanças de preço deveriam entrar como nova vigência (histórico).</p></div>
          <button className="btn-primary" onClick={() => setEditando({ novo: true })}>+ Nova tabela</button>
        </div>
        {erro && <div className="aviso">{erro}</div>}
        <div className="tabela-scroll">
          <table>
            <thead><tr><th>Tipo</th><th>Descrição</th><th>Seleção manual</th><th></th></tr></thead>
            <tbody>
              {tabelas.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.tipo}</td>
                  <td>{t.descricao}</td>
                  <td>{t.selecao_manual ? 'Sim' : 'Não'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-ghost" onClick={() => { setSel(t); setEditando(t); }}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {sel && <Faixas perfil={perfil} tabela={sel} />}
      {editando && (
        <HeaderModal inicial={editando.novo ? {} : editando} onSalvar={salvarHeader}
          onExcluir={editando.id ? () => excluirTabela(editando.id) : null}
          onFechar={() => setEditando(null)} />
      )}
    </>
  );
}

function HeaderModal({ inicial, onSalvar, onExcluir, onFechar }) {
  const [t, setT] = useState(inicial);
  const set = (k, v) => setT((o) => ({ ...o, [k]: v }));
  const campos = [
    ['tipo', 'Tipo (código)', 'text'], ['descricao', 'Descrição', 'text'],
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
          <div className="linha-form" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            {onExcluir ? <button type="button" className="btn-ghost aviso-btn" onClick={onExcluir}>Excluir tabela</button> : <span />}
            <div className="linha-form">
              <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
              <button type="submit" className="btn-primary">Salvar</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Faixas({ perfil, tabela }) {
  const [faixas, setFaixas] = useState([]);
  const [nova, setNova] = useState({ ate: '', valor_hora: '', valor_convenio: '', tipo_cobranca: 'fixo' });
  const [emEdicao, setEmEdicao] = useState(null); // faixa sendo editada na própria linha
  const [erro, setErro] = useState('');

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

  async function salvarEdicao(e) {
    e.preventDefault();
    setErro('');
    const { error } = await supabase.from('tabela_preco_faixas').update({
      ate: Number(emEdicao.ate),
      valor_hora: Number(emEdicao.valor_hora),
      valor_convenio: Number(emEdicao.valor_convenio || 0),
      tipo_cobranca: emEdicao.tipo_cobranca,
    }).eq('id', emEdicao.id);
    if (error) { setErro(error.message); return; }
    setEmEdicao(null);
    carregar();
  }

  return (
    <div className="card">
      <h2>Faixas — {tabela.tipo} · {tabela.descricao}</h2>
      <p className="suave">
        "Fixo": valor cheio da faixa. "Por hora": <code>valor_hora</code> vira taxa por hora,
        cobrada a partir do teto da faixa anterior (fração arredonda pra cima).
      </p>
      {erro && <div className="aviso">{erro}</div>}
      <table>
        <thead><tr><th>Ordem</th><th>Até (HH.MM)</th><th>Tipo</th><th>Valor</th><th>Valor convênio</th><th></th></tr></thead>
        <tbody>
          {faixas.map((f) => (emEdicao?.id === f.id ? (
            // Edição na própria linha: mesmos campos do formulário de baixo.
            <tr key={f.id}>
              <td>{f.ordem}</td>
              <td><input type="number" step="0.01" style={{ width: 90 }} value={emEdicao.ate} required
                onChange={(e) => setEmEdicao({ ...emEdicao, ate: e.target.value })} /></td>
              <td>
                <select value={emEdicao.tipo_cobranca}
                  onChange={(e) => setEmEdicao({ ...emEdicao, tipo_cobranca: e.target.value })}>
                  <option value="fixo">Fixo</option>
                  <option value="hora">Por hora</option>
                </select>
              </td>
              <td><input type="number" step="0.01" style={{ width: 90 }} value={emEdicao.valor_hora} required
                onChange={(e) => setEmEdicao({ ...emEdicao, valor_hora: e.target.value })} /></td>
              <td><input type="number" step="0.01" style={{ width: 90 }} value={emEdicao.valor_convenio}
                onChange={(e) => setEmEdicao({ ...emEdicao, valor_convenio: e.target.value })} /></td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn-ghost" onClick={() => setEmEdicao(null)}>Cancelar</button>
                <button className="btn-primary" onClick={salvarEdicao}>Salvar</button>
              </td>
            </tr>
          ) : (
            <tr key={f.id}>
              <td>{f.ordem}</td><td className="mono">{fmtHora(Number(f.ate))}</td>
              <td>{f.tipo_cobranca === 'hora' ? 'Por hora' : 'Fixo'}</td>
              <td>{fmtBRL(Number(f.valor_hora))}{f.tipo_cobranca === 'hora' ? '/h' : ''}</td>
              <td>{fmtBRL(Number(f.valor_convenio))}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn-ghost" disabled={!!emEdicao} onClick={() => setEmEdicao({
                  id: f.id, ate: String(f.ate), valor_hora: String(f.valor_hora),
                  valor_convenio: String(f.valor_convenio ?? 0), tipo_cobranca: f.tipo_cobranca || 'fixo',
                })}>Editar</button>
                <button className="btn-ghost aviso-btn" disabled={!!emEdicao} onClick={() => excluir(f.id)}>Excluir</button>
              </td>
            </tr>
          )))}
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
