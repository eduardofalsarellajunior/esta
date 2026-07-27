import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { carregarModelosVeiculo } from '../lib/dados.js';
import { normalizar, REGEX_PLACA } from '../lib/texto.js';

// Mensalistas/hóspedes + os veículos de cada um (1:N) e a quantidade de vagas
// contratadas simultâneas. Se mais veículos do que isso estiverem no pátio ao
// mesmo tempo, os excedentes entram como avulso (checado em Patio.jsx).
export default function Mensalistas({ perfil }) {
  const [lista, setLista] = useState([]);
  const [sel, setSel] = useState(null); // mensalista cujos veículos aparecem embaixo
  const [editando, setEditando] = useState(null); // objeto no modal de cabeçalho (null = fechado)
  const [erro, setErro] = useState('');

  async function carregar() {
    const { data, error } = await supabase.from('mensalistas').select('*').order('codigo');
    if (error) setErro(error.message); else setLista(data);
  }
  useEffect(() => { carregar(); }, []);

  async function salvar(m) {
    setErro('');
    const payload = {
      filial_id: perfil.filial_id, codigo: m.codigo, razao: m.razao,
      tipo_mens: m.tipo_mens || 'I', telefone: m.telefone || null, celular: m.celular || null,
      email: m.email || null, box: m.box || null,
      dia_venc: m.dia_venc ? Number(m.dia_venc) : null,
      tolerancia_dias: Number(m.tolerancia_dias || 0), qte_vagas: Number(m.qte_vagas || 1),
      ativo: m.ativo ?? true,
    };
    const res = m.id
      ? await supabase.from('mensalistas').update(payload).eq('id', m.id).select().single()
      : await supabase.from('mensalistas').insert(payload).select().single();
    if (res.error) { setErro(res.error.message); return; }
    setEditando(null); setSel(res.data); carregar();
  }

  async function excluir(id) {
    if (!window.confirm('Excluir este mensalista? Os veículos cadastrados dele também são removidos.')) return;
    setErro('');
    const { error } = await supabase.from('mensalistas').delete().eq('id', id);
    if (error) { setErro(error.message); return; }
    setEditando(null); setSel(null); carregar();
  }

  return (
    <>
      <div className="card">
        <div className="card-cab">
          <div><h2>Mensalistas</h2>
            <p className="suave">Mensalistas/hóspedes, com os veículos e a quantidade de vagas contratadas simultâneas.</p></div>
          <button className="btn-primary" onClick={() => setEditando({ novo: true })}>+ Novo</button>
        </div>
        {erro && <div className="aviso">{erro}</div>}
        <div className="tabela-scroll">
          <table>
            <thead><tr><th>Código</th><th>Nome</th><th>Tipo</th><th>Box</th><th>Vagas</th><th>Ativo</th><th></th></tr></thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id}>
                  <td className="mono">{m.codigo}</td>
                  <td>{m.razao}</td>
                  <td>{rotuloTipoMens(m.tipo_mens)}</td>
                  <td>{m.box || '—'}</td>
                  <td>{m.qte_vagas}</td>
                  <td>{m.ativo ? 'Sim' : 'Não'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-ghost" onClick={() => { setSel(m); setEditando(m); }}>Editar</button>
                  </td>
                </tr>
              ))}
              {lista.length === 0 && <tr><td colSpan={7} className="suave">Nenhum mensalista.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {sel && <Veiculos perfil={perfil} mensalista={sel} />}

      {editando && (
        <HeaderModal inicial={editando.novo ? {} : editando} onSalvar={salvar}
          onExcluir={editando.id ? () => excluir(editando.id) : null}
          onFechar={() => setEditando(null)} />
      )}
    </>
  );
}

function rotuloTipoMens(t) {
  return { I: 'Mensalista', P: 'Pacote', H: 'Hóspede' }[t] || t;
}

function HeaderModal({ inicial, onSalvar, onExcluir, onFechar }) {
  const [m, setM] = useState(inicial);
  const set = (k, v) => setM((o) => ({ ...o, [k]: v }));
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480, maxHeight: '85vh', overflow: 'auto' }}>
        <h2>{m.id ? 'Editar' : 'Novo'} mensalista</h2>
        <form onSubmit={(e) => { e.preventDefault(); onSalvar(m); }}>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Código *</label>
            <input value={m.codigo || ''} onChange={(e) => set('codigo', e.target.value)} required />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Nome *</label>
            <input value={m.razao || ''} onChange={(e) => set('razao', e.target.value)} required />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Tipo</label>
            <select value={m.tipo_mens || 'I'} onChange={(e) => set('tipo_mens', e.target.value)}>
              <option value="I">Mensalista</option>
              <option value="P">Pacote</option>
              <option value="H">Hóspede</option>
            </select>
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Telefone</label>
            <input value={m.telefone || ''} onChange={(e) => set('telefone', e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Celular</label>
            <input value={m.celular || ''} onChange={(e) => set('celular', e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>E-mail</label>
            <input value={m.email || ''} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Box</label>
            <input value={m.box || ''} onChange={(e) => set('box', e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Dia vencimento</label>
            <input type="number" value={m.dia_venc ?? ''} onChange={(e) => set('dia_venc', e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Tolerância (dias)</label>
            <input type="number" value={m.tolerancia_dias ?? ''} onChange={(e) => set('tolerancia_dias', e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Vagas contratadas (veículos simultâneos)</label>
            <input type="number" min="1" value={m.qte_vagas ?? 1} onChange={(e) => set('qte_vagas', e.target.value)} required />
          </div>
          <label className="campo-check" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={m.ativo ?? true} onChange={(e) => set('ativo', e.target.checked)} /> Ativo
          </label>
          <div className="linha-form" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            {onExcluir ? <button type="button" className="btn-ghost aviso-btn" onClick={onExcluir}>Excluir mensalista</button> : <span />}
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

function Veiculos({ perfil, mensalista }) {
  const [veiculos, setVeiculos] = useState([]);
  const [placa, setPlaca] = useState('');
  const [tipoVeic, setTipoVeic] = useState('');
  const [erro, setErro] = useState('');
  const [confirmPlaca, setConfirmPlaca] = useState(null); // placa fora do formato, aguardando confirmação

  // Busca de modelo no catálogo — mesmo comportamento da Entrada (Pátio).
  const [modelos, setModelos] = useState([]);
  const [buscaModelo, setBuscaModelo] = useState('');
  const [modeloSelecionado, setModeloSelecionado] = useState(null);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);

  const sugestoes = useMemo(() => {
    const alvo = normalizar(buscaModelo);
    if (alvo.length < 2) return [];
    return modelos.filter((m) => normalizar(m.nome).includes(alvo)).slice(0, 8);
  }, [buscaModelo, modelos]);

  useEffect(() => { carregarModelosVeiculo().then(setModelos); }, []);

  async function carregar() {
    const { data } = await supabase.from('mensalista_veiculos')
      .select('*').eq('mensalista_id', mensalista.id).order('placa');
    setVeiculos(data || []);
  }
  useEffect(() => { carregar(); }, [mensalista.id]);

  function onBuscaModeloChange(v) {
    const up = v.toUpperCase();
    setBuscaModelo(up);
    setMostrarSugestoes(true);
    setModeloSelecionado((m) => (m && normalizar(up) !== normalizar(m.nome)) ? null : m);
  }

  function selecionarModelo(m) {
    setModeloSelecionado(m);
    setBuscaModelo(m.nome);
    setMostrarSugestoes(false);
    if (m.tabela_tipo) setTipoVeic(m.tabela_tipo);
  }

  function limparForm() {
    setPlaca(''); setTipoVeic(''); setConfirmPlaca(null);
    setBuscaModelo(''); setModeloSelecionado(null); setMostrarSugestoes(false);
  }

  async function inserirVeiculo(p) {
    setErro('');
    const { error } = await supabase.from('mensalista_veiculos').insert({
      filial_id: perfil.filial_id, mensalista_id: mensalista.id,
      placa: p, modelo: buscaModelo.trim() || null,
      tipo_veic: tipoVeic.trim().toUpperCase() || null,
    });
    if (error) { setErro(error.code === '23505' ? 'Essa placa já está cadastrada (nesta ou noutra filial).' : error.message); setConfirmPlaca(null); return; }
    limparForm();
    carregar();
  }

  async function adicionar(e) {
    e.preventDefault();
    const p = placa.trim().toUpperCase();
    if (!p) return;
    if (!REGEX_PLACA.test(p)) { setConfirmPlaca(p); return; }
    await inserirVeiculo(p);
  }

  async function excluir(id) { await supabase.from('mensalista_veiculos').delete().eq('id', id); carregar(); }

  return (
    <div className="card">
      <h2>Veículos — {mensalista.razao}</h2>
      <p className="suave">
        Contratou {mensalista.qte_vagas} vaga(s) simultânea(s). Se mais veículos do que isso
        estiverem no pátio ao mesmo tempo, os excedentes entram como avulso.
      </p>
      {erro && <div className="aviso">{erro}</div>}
      <table>
        <thead><tr><th>Placa</th><th>Modelo</th><th>Tabela</th><th></th></tr></thead>
        <tbody>
          {veiculos.map((v) => (
            <tr key={v.id}>
              <td className="mono">{v.placa}</td>
              <td>{v.modelo || '—'}</td>
              <td className="mono">{v.tipo_veic || '—'}</td>
              <td style={{ textAlign: 'right' }}><button className="btn-ghost aviso-btn" onClick={() => excluir(v.id)}>Excluir</button></td>
            </tr>
          ))}
          {veiculos.length === 0 && <tr><td colSpan={4} className="suave">Nenhum veículo cadastrado.</td></tr>}
        </tbody>
      </table>
      <form className="linha-form" onSubmit={adicionar} style={{ marginTop: 10 }}>
        <div className="campo">
          <label>Placa</label>
          <input className="mono" style={{ textTransform: 'uppercase', width: 140 }}
            value={placa} onChange={(e) => { setPlaca(e.target.value); setConfirmPlaca(null); }}
            placeholder="ABC1D23" required />
        </div>
        <div className="campo campo-busca" style={{ minWidth: 200 }}>
          <label>Modelo</label>
          <input value={buscaModelo}
            onChange={(e) => onBuscaModeloChange(e.target.value)}
            onFocus={() => setMostrarSugestoes(true)}
            onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
            placeholder="Digite o modelo…" style={{ width: '100%' }} />
          {mostrarSugestoes && sugestoes.length > 0 && (
            <ul className="sugestoes-lista">
              {sugestoes.map((m) => (
                <li key={m.id} className="sugestao-item"
                  onMouseDown={(e) => { e.preventDefault(); selecionarModelo(m); }}>
                  {m.nome}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="campo">
          <label>Tabela</label>
          <input className="mono" style={{ width: 80, textTransform: 'uppercase' }}
            value={tipoVeic} onChange={(e) => setTipoVeic(e.target.value)} />
        </div>
        <button className="btn-primary" type="submit">+ Veículo</button>
        {modeloSelecionado && <span className="badge-mens">Tabela: {modeloSelecionado.tabela_tipo}</span>}
      </form>

      {confirmPlaca && (
        <div className="modal-bg" onClick={() => setConfirmPlaca(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Confirmar placa</h2>
            <p className="suave">Essa placa não parece ter um formato válido (ex.: ABC1234 ou ABC1D23).</p>
            <div className="grande mono">{confirmPlaca}</div>
            <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => setConfirmPlaca(null)}>Não, corrigir</button>
              <button className="btn-primary" onClick={() => inserirVeiculo(confirmPlaca)}>Sim, está correta</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
