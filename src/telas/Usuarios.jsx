import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { PAPEIS, ehSupervisor, ehFornecedor } from '../lib/acesso.js';

/**
 * "AR7 Car Wash" -> "ar7carwash.com.br" — o domínio do e-mail de login segue
 * sempre o nome fantasia da filial (convenção já usada manualmente antes de
 * existir esse formulário), pra um supervisor menos cuidadoso não poder
 * colocar qualquer coisa depois do @ ao criar um usuário novo.
 */
function dominioEmailDaFilial(nomeFantasia) {
  const base = String(nomeFantasia || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return base ? `${base}.com.br` : '';
}

// Quem acessa o sistema (perfis) — nome, papel e ativo/inativo.
// Criar o login (e-mail/senha) roda em api/criar-usuario.js, que tem a chave
// de service_role do Supabase — o navegador não pode ter essa chave. Se ela
// não estiver configurada, ainda dá pra criar o login no painel do Supabase
// e vincular por aqui pelo UID.
export default function Usuarios({ perfil }) {
  const [lista, setLista] = useState([]);
  const [editando, setEditando] = useState(null); // objeto no modal (null = fechado)
  const [trocandoSenha, setTrocandoSenha] = useState(null); // usuário no modal de troca de senha
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [dominioEmail, setDominioEmail] = useState('');
  const podeEditar = ehSupervisor(perfil);

  async function carregar() {
    const { data, error } = await supabase.from('perfis').select('*').order('nome');
    if (error) setErro(error.message); else setLista(data);
  }
  useEffect(() => { carregar(); }, []);
  useEffect(() => {
    supabase.from('filiais').select('nome_fantasia').eq('id', perfil.filial_id).maybeSingle()
      .then(({ data }) => setDominioEmail(dominioEmailDaFilial(data?.nome_fantasia)));
  }, [perfil.filial_id]);

  async function salvar(u) {
    setErro(''); setMsg('');

    // Login novo: cria e-mail/senha + perfil de uma vez, no servidor.
    if (!u.id && u.modo === 'novo-login') {
      const { data: sessao } = await supabase.auth.getSession();
      const resp = await fetch('/api/criar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.session?.access_token}` },
        body: JSON.stringify({ email: u.email, senha: u.senha, nome: u.nome, papel: u.papel || 'operador' }),
      });
      const dados = await resp.json();
      if (!resp.ok) { setErro(dados.erro || `Falha ao criar usuário (${resp.status}).`); return; }
      setEditando(null); setMsg(`Usuário criado — ${u.nome} já pode entrar com ${u.email}.`); carregar();
      return;
    }

    // E-mail só é gravável na criação — depois de criado o login, o campo é
    // só histórico/exibição e não muda mais por aqui (ver nota no campo:
    // trocar o e-mail de login de verdade mexe direto no Supabase Auth, não
    // só em perfis, e já causou confusão de "troquei mas não mudou nada").
    const payload = {
      filial_id: perfil.filial_id, nome: u.nome, papel: u.papel || 'operador',
      ativo: u.ativo ?? true,
      ...(u.id ? {} : { email: u.email || null }),
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

  async function trocarSenha(u, senha) {
    setErro(''); setMsg('');
    const { data: sessao } = await supabase.auth.getSession();
    const resp = await fetch('/api/trocar-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.session?.access_token}` },
      body: JSON.stringify({ userId: u.id, senha }),
    });
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) { setErro(dados.erro || `Falha ao trocar a senha (${resp.status}).`); return; }
    setTrocandoSenha(null); setMsg(`Senha de ${u.nome} trocada — já pode passar a nova senha pra pessoa.`);
  }

  return (
    <div className="card">
      <div className="card-cab">
        <div><h2>Usuários</h2>
          <p className="suave">
            Quem acessa o sistema e com que papel. "+ Novo" já cria o login (e-mail e senha) junto
            com o perfil — é só passar a senha pra pessoa, que ela entra direto.
          </p>
        </div>
        {podeEditar && <button className="btn-primary" onClick={() => setEditando({ novo: true })}>+ Novo</button>}
      </div>
      {erro && <div className="aviso">{erro}</div>}
      {msg && <div className="ok-txt">{msg}</div>}
      <div className="tabela-scroll">
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Ativo</th><th></th></tr></thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id}>
                <td>{u.nome}</td>
                <td>{u.email || '—'}</td>
                <td>{PAPEIS[u.papel] || u.papel}</td>
                <td>{u.ativo ? 'Sim' : 'Não'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {podeEditar && (
                    <>
                      <button className="btn-ghost" onClick={() => setEditando(u)}>Editar</button>
                      <button className="btn-ghost" onClick={() => setTrocandoSenha(u)}>Trocar senha</button>
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
        <UsuarioModal inicial={editando.novo ? {} : editando} onSalvar={salvar} dominioEmail={dominioEmail}
          podeCriarFornecedor={ehFornecedor(perfil)} onFechar={() => setEditando(null)} />
      )}

      {trocandoSenha && (
        <TrocarSenhaModal usuario={trocandoSenha} onConfirmar={trocarSenha} onFechar={() => setTrocandoSenha(null)} />
      )}
    </div>
  );
}

function TrocarSenhaModal({ usuario, onConfirmar, onFechar }) {
  const [senha, setSenha] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setSalvando(true);
    await onConfirmar(usuario, senha);
    setSalvando(false);
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Trocar senha — {usuario.nome}</h2>
        <p className="suave">{usuario.email}</p>
        <form onSubmit={enviar}>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Nova senha *</label>
            <input type="text" className="mono" value={senha} minLength={6} autoFocus
              onChange={(e) => setSenha(e.target.value)} required />
            <span className="suave" style={{ fontSize: 11 }}>
              Mínimo 6 caracteres. Fica visível de propósito, pra você passar pra pessoa.
            </span>
          </div>
          <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={salvando}>
              {salvando ? 'Trocando…' : 'Trocar senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UsuarioModal({ inicial, onSalvar, podeCriarFornecedor, dominioEmail, onFechar }) {
  const [u, setU] = useState({ modo: 'novo-login', ...inicial });
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setU((o) => ({ ...o, [k]: v }));
  const criandoLogin = !u.id && u.modo === 'novo-login';
  // Sem nome fantasia configurado, não tem como montar o domínio — cai pro
  // campo de e-mail inteiro de sempre em vez de travar a criação de usuário.
  const usaDominioFixo = criandoLogin && !!dominioEmail;

  async function enviar(e) {
    e.preventDefault();
    setSalvando(true);
    const payload = usaDominioFixo ? { ...u, email: `${(u.emailLocal || '').trim()}@${dominioEmail}` } : u;
    await onSalvar(payload);
    setSalvando(false);
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{u.id ? 'Editar' : 'Novo'} usuário</h2>
        <form onSubmit={enviar}>
          {!u.id && (
            <div className="campo" style={{ marginBottom: 10 }}>
              <label>Como criar</label>
              <select value={u.modo} onChange={(e) => set('modo', e.target.value)}>
                <option value="novo-login">Criar login novo (e-mail e senha)</option>
                <option value="vincular">Vincular um login que já existe (UID)</option>
              </select>
            </div>
          )}
          {!u.id && u.modo === 'vincular' && (
            <div className="campo" style={{ marginBottom: 10 }}>
              <label>UID do Supabase Auth *</label>
              <input className="mono" value={u.uid || ''} onChange={(e) => set('uid', e.target.value)} required />
              <span className="suave" style={{ fontSize: 11 }}>
                Pegue em Supabase → Authentication, na coluna UID do usuário.
              </span>
            </div>
          )}
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Nome *</label>
            <input value={u.nome || ''} onChange={(e) => set('nome', e.target.value)} required />
          </div>
          {usaDominioFixo ? (
            <div className="campo" style={{ marginBottom: 10 }}>
              <label>Usuário (e-mail) *</label>
              <div className="linha-form" style={{ gap: 4, flexWrap: 'nowrap', alignItems: 'center' }}>
                <input value={u.emailLocal || ''} style={{ flex: 1 }} placeholder="joao" autoFocus
                  onChange={(e) => set('emailLocal', e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                  required />
                <span className="suave mono">@{dominioEmail}</span>
              </div>
              <span className="suave" style={{ fontSize: 11 }}>
                É com esse e-mail que a pessoa vai entrar — o domínio é sempre o do estacionamento.
              </span>
            </div>
          ) : (
            <div className="campo" style={{ marginBottom: 10 }}>
              <label>E-mail {criandoLogin ? '*' : '(login — não muda por aqui)'}</label>
              <input type="email" value={u.email || ''} onChange={(e) => set('email', e.target.value)}
                required={criandoLogin} disabled={!!u.id} />
              {criandoLogin && (
                <span className="suave" style={{ fontSize: 11 }}>
                  É com esse e-mail que a pessoa vai entrar. Cadastre o nome fantasia da filial em
                  Configurações pra esse campo virar só "usuário" com o domínio preenchido sozinho.
                </span>
              )}
              {!!u.id && (
                <span className="suave" style={{ fontSize: 11 }}>
                  Pra trocar o e-mail de login de verdade, peça pro suporte — mexe direto na
                  autenticação, não só no cadastro.
                </span>
              )}
            </div>
          )}
          {criandoLogin && (
            <div className="campo" style={{ marginBottom: 10 }}>
              <label>Senha inicial *</label>
              <input type="text" className="mono" value={u.senha || ''} minLength={6}
                onChange={(e) => set('senha', e.target.value)} required />
              <span className="suave" style={{ fontSize: 11 }}>
                Mínimo 6 caracteres. Fica visível de propósito, pra você passar pra pessoa — ela pode trocar depois.
              </span>
            </div>
          )}
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Papel</label>
            <select value={u.papel || 'operador'} onChange={(e) => set('papel', e.target.value)}>
              <option value="operador">Operador — pátio e caixa</option>
              <option value="gerente">Gerente — + painel, mensalistas, convênios, serviços, fiscal e receber</option>
              <option value="supervisor">Supervisor — tudo do estacionamento</option>
              {/* Fornecedor acessa todos os clientes; só outro fornecedor cria
                  um (o banco recusa, não é só a tela que esconde). */}
              {podeCriarFornecedor && <option value="fornecedor">Fornecedor — todos os estacionamentos</option>}
            </select>
          </div>
          {!criandoLogin && (
            <label className="campo-check" style={{ marginBottom: 10 }}>
              <input type="checkbox" checked={u.ativo ?? true} onChange={(e) => set('ativo', e.target.checked)} /> Ativo
            </label>
          )}
          <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={salvando}>
              {salvando ? 'Salvando…' : (criandoLogin ? 'Criar usuário' : 'Salvar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
