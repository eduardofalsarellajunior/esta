import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Quem acessa o sistema (perfis) — nome, papel e ativo/inativo.
// Criar o LOGIN em si (e-mail/senha) continua manual no painel do Supabase
// (Authentication → Add user): o navegador não pode ter a chave admin
// necessária pra isso com segurança. Aqui só vincula o UID desse login a um
// nome/papel/filial, colando o UID depois de criado.
export default function Usuarios({ perfil }) {
  const [lista, setLista] = useState([]);
  const [editando, setEditando] = useState(null); // objeto no modal (null = fechado)
  const [erro, setErro] = useState('');
  const podeEditar = perfil.papel === 'supervisor';

  async function carregar() {
    const { data, error } = await supabase.from('perfis').select('*').order('nome');
    if (error) setErro(error.message); else setLista(data);
  }
  useEffect(() => { carregar(); }, []);

  async function salvar(u) {
    setErro('');
    const payload = {
      filial_id: perfil.filial_id, nome: u.nome, papel: u.papel || 'operador',
      email: u.email || null, ativo: u.ativo ?? true,
    };
    const res = u.id
      ? await supabase.from('perfis').update(payload).eq('id', u.id)
      : await supabase.from('perfis').insert({ id: (u.uid || '').trim(), ...payload });
    if (res.error) {
      setErro(res.error.code === '23505' ? 'Esse UID já tem perfil cadastrado.' : res.error.message);
      return;
    }
    setEditando(null); carregar();
  }

  async function alternarAtivo(u) {
    setErro('');
    const { error } = await supabase.from('perfis').update({ ativo: !u.ativo }).eq('id', u.id);
    if (error) { setErro(error.message); return; }
    carregar();
  }

  return (
    <div className="card">
      <div className="card-cab">
        <div><h2>Usuários</h2>
          <p className="suave">
            Quem acessa o sistema e com que papel. Criar o login (e-mail/senha) ainda é feito
            em Supabase → Authentication → Add user — aqui só vincula esse login a um nome/papel.
          </p>
        </div>
        {podeEditar && <button className="btn-primary" onClick={() => setEditando({ novo: true })}>+ Novo</button>}
      </div>
      {erro && <div className="aviso">{erro}</div>}
      <div className="tabela-scroll">
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Ativo</th><th></th></tr></thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id}>
                <td>{u.nome}</td>
                <td>{u.email || '—'}</td>
                <td>{u.papel === 'supervisor' ? 'Supervisor' : 'Operador'}</td>
                <td>{u.ativo ? 'Sim' : 'Não'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {podeEditar && (
                    <>
                      <button className="btn-ghost" onClick={() => setEditando(u)}>Editar</button>
                      <button className="btn-ghost aviso-btn" disabled={u.id === perfil.id}
                        onClick={() => alternarAtivo(u)}>
                        {u.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={5} className="suave">Nenhum usuário.</td></tr>}
          </tbody>
        </table>
      </div>

      {editando && (
        <UsuarioModal inicial={editando.novo ? {} : editando} onSalvar={salvar} onFechar={() => setEditando(null)} />
      )}
    </div>
  );
}

function UsuarioModal({ inicial, onSalvar, onFechar }) {
  const [u, setU] = useState(inicial);
  const set = (k, v) => setU((o) => ({ ...o, [k]: v }));
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{u.id ? 'Editar' : 'Novo'} usuário</h2>
        <form onSubmit={(e) => { e.preventDefault(); onSalvar(u); }}>
          {!u.id && (
            <div className="campo" style={{ marginBottom: 10 }}>
              <label>UID do Supabase Auth *</label>
              <input className="mono" value={u.uid || ''} onChange={(e) => set('uid', e.target.value)} required />
              <span className="suave" style={{ fontSize: 11 }}>
                Crie o login em Supabase → Authentication → Add user, depois cole o UID aqui.
              </span>
            </div>
          )}
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Nome *</label>
            <input value={u.nome || ''} onChange={(e) => set('nome', e.target.value)} required />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>E-mail (só referência)</label>
            <input type="email" value={u.email || ''} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Papel</label>
            <select value={u.papel || 'operador'} onChange={(e) => set('papel', e.target.value)}>
              <option value="operador">Operador</option>
              <option value="supervisor">Supervisor</option>
            </select>
          </div>
          <label className="campo-check" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={u.ativo ?? true} onChange={(e) => set('ativo', e.target.checked)} /> Ativo
          </label>
          <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
            <button type="submit" className="btn-primary">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
