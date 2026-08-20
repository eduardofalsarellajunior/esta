import { Fragment, useEffect, useState } from 'react';
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
                <Fragment key={t.id}>
                  <tr className={'linha-clicavel' + (sel?.id === t.id ? ' linha-selecionada' : '')}
                    onClick={() => setSel((s) => (s?.id === t.id ? null : t))}
                    title="Clique pra ver e cadastrar as faixas desta tabela">
                    <td className="mono">{t.tipo}</td>
                    <td>{t.descricao}</td>
                    <td>{t.selecao_manual ? 'Sim' : 'Não'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); setSel(t); setEditando(t); }}>Editar</button>
                    </td>
                  </tr>
                  {sel?.id === t.id && (
                    <tr><td colSpan={4} className="linha-expandida"><Faixas perfil={perfil} tabela={sel} /></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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

/** Valor padrão do campo Período ao trocar pra "Por período": 1.00 = 1 hora. */
const PERIODO_PADRAO = '1';

function Faixas({ perfil, tabela }) {
  const [faixas, setFaixas] = useState([]);
  const [nova, setNova] = useState({ ate: '', valor_hora: '', valor_convenio: '', tipo_cobranca: 'fixo', periodo: PERIODO_PADRAO });
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
      ate: Number(nova.ate),
      // "Pede valor" não tem número configurado — o motor ignora valor_hora
      // pra esse tipo (ver packages/tarifacao/README.md), manda 0 só porque
      // a coluna é NOT NULL.
      valor_hora: nova.tipo_cobranca === 'valor' ? 0 : Number(nova.valor_hora),
      valor_convenio: Number(nova.valor_convenio || 0),
      tipo_cobranca: nova.tipo_cobranca,
      // Só importa em "por período" — a coluna no banco tem default 1h de qualquer forma.
      periodo: nova.tipo_cobranca === 'hora' ? Number(nova.periodo || 1) : 1,
    });
    setNova({ ate: '', valor_hora: '', valor_convenio: '', tipo_cobranca: 'fixo', periodo: PERIODO_PADRAO });
    carregar();
  }
  async function excluir(id) { await supabase.from('tabela_preco_faixas').delete().eq('id', id); carregar(); }

  async function salvarEdicao(e) {
    e.preventDefault();
    setErro('');
    const { error } = await supabase.from('tabela_preco_faixas').update({
      ate: Number(emEdicao.ate),
      valor_hora: emEdicao.tipo_cobranca === 'valor' ? 0 : Number(emEdicao.valor_hora),
      valor_convenio: Number(emEdicao.valor_convenio || 0),
      tipo_cobranca: emEdicao.tipo_cobranca,
      periodo: emEdicao.tipo_cobranca === 'hora' ? Number(emEdicao.periodo || 1) : 1,
    }).eq('id', emEdicao.id);
    if (error) { setErro(error.message); return; }
    setEmEdicao(null);
    carregar();
  }

  return (
    <div className="card">
      <h2>Faixas — {tabela.tipo} · {tabela.descricao}</h2>
      <p className="suave">
        "Fixo": valor cheio da faixa. "Por período": <code>valor_hora</code> vira taxa por período
        (o Período abaixo — 0.30 = 30min, 1 = 1h, padrão, 24 = 24h), cobrada a partir do teto da
        faixa anterior (fração de período arredonda pra cima). "Pede valor": sem número
        configurado — a saída pergunta ao operador quanto cobrar e usa como se fosse fixo.
      </p>
      {erro && <div className="aviso">{erro}</div>}
      <table>
        <thead><tr><th>Ordem</th><th>Até (HH.MM)</th><th>Tipo</th><th>Período</th><th>Valor</th><th>Valor convênio</th><th></th></tr></thead>
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
                  <option value="hora">Por período</option>
                  <option value="valor">Pede valor</option>
                </select>
              </td>
              <td>
                {emEdicao.tipo_cobranca === 'hora' && (
                  <input type="number" step="0.01" min="0.01" style={{ width: 70 }} value={emEdicao.periodo} required
                    title="0.30 = 30min · 1 = 1h · 24 = 24h"
                    onChange={(e) => setEmEdicao({ ...emEdicao, periodo: e.target.value })} />
                )}
              </td>
              <td>
                {emEdicao.tipo_cobranca !== 'valor' && (
                  <input type="number" step="0.01" style={{ width: 90 }} value={emEdicao.valor_hora} required
                    onChange={(e) => setEmEdicao({ ...emEdicao, valor_hora: e.target.value })} />
                )}
              </td>
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
              <td>{f.tipo_cobranca === 'hora' ? 'Por período' : f.tipo_cobranca === 'valor' ? 'Pede valor' : 'Fixo'}</td>
              <td className="mono">{f.tipo_cobranca === 'hora' ? fmtHora(Number(f.periodo ?? 1)) : '—'}</td>
              <td>
                {f.tipo_cobranca === 'valor' ? '—' : fmtBRL(Number(f.valor_hora))}
                {f.tipo_cobranca === 'hora' ? ` / ${fmtHora(Number(f.periodo ?? 1))}` : ''}
              </td>
              <td>{fmtBRL(Number(f.valor_convenio))}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn-ghost" disabled={!!emEdicao} onClick={() => setEmEdicao({
                  id: f.id, ate: String(f.ate), valor_hora: String(f.valor_hora),
                  valor_convenio: String(f.valor_convenio ?? 0), tipo_cobranca: f.tipo_cobranca || 'fixo',
                  periodo: String(f.periodo ?? 1),
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
          <select value={nova.tipo_cobranca} onChange={(e) => setNova({ ...nova, tipo_cobranca: e.target.value, periodo: nova.periodo || PERIODO_PADRAO })}>
            <option value="fixo">Fixo</option>
            <option value="hora">Por período</option>
            <option value="valor">Pede valor</option>
          </select>
        </div>
        {nova.tipo_cobranca === 'hora' && (
          <div className="campo">
            <label>Período</label>
            <input type="number" step="0.01" min="0.01" style={{ width: 90 }} value={nova.periodo}
              title="0.30 = 30min · 1 = 1h (padrão) · 24 = 24h"
              onChange={(e) => setNova({ ...nova, periodo: e.target.value })} required />
            <span className="suave" style={{ fontSize: 11 }}>0.30=30min · 1=1h · 24=24h</span>
          </div>
        )}
        {nova.tipo_cobranca !== 'valor' && (
          <div className="campo"><label>Valor</label><input type="number" step="0.01" value={nova.valor_hora} onChange={(e) => setNova({ ...nova, valor_hora: e.target.value })} required /></div>
        )}
        <div className="campo"><label>Valor convênio</label><input type="number" step="0.01" value={nova.valor_convenio} onChange={(e) => setNova({ ...nova, valor_convenio: e.target.value })} /></div>
        <button className="btn-primary" type="submit">+ Faixa</button>
      </form>
    </div>
  );
}
