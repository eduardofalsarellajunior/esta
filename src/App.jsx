import { useEffect, useState } from 'react';
import { supabase, configurado } from './lib/supabase.js';
import Patio from './Patio.jsx';

export default function App() {
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!configurado) { setCarregando(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessao) { setPerfil(null); return; }
    supabase.from('perfis').select('*').eq('id', sessao.user.id).maybeSingle()
      .then(({ data }) => setPerfil(data));
  }, [sessao]);

  if (!configurado) return <ConfigPendente />;
  if (carregando) return <div className="centro">Carregando…</div>;
  if (!sessao) return <Login />;

  return (
    <>
      <header className="topo">
        <h1>esta <span className="ambar">· PDV</span></h1>
        <div>
          {perfil && <span style={{ color: 'var(--suave)', marginRight: 12 }}>{perfil.nome} ({perfil.papel})</span>}
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>
      <div className="container">
        {perfil
          ? <Patio perfil={perfil} />
          : <div className="card aviso">Usuário autenticado, mas sem <strong>perfil</strong> vinculado a uma filial.
              Crie um registro em <code>perfis</code> (id = id do usuário, filial_id da filial).</div>}
      </div>
    </>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro(''); setOcupado(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) setErro(error.message);
    setOcupado(false);
  }

  return (
    <div className="centro">
      <form className="card" style={{ width: 360 }} onSubmit={entrar}>
        <h2>Entrar</h2>
        <div className="campo" style={{ marginBottom: 10 }}>
          <label>E-mail</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" />
        </div>
        <div className="campo" style={{ marginBottom: 16 }}>
          <label>Senha</label>
          <input value={senha} onChange={(e) => setSenha(e.target.value)} type="password" autoComplete="current-password" />
        </div>
        {erro && <p className="aviso">{erro}</p>}
        <button className="btn-primary" style={{ width: '100%' }} disabled={ocupado}>
          {ocupado ? '…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

function ConfigPendente() {
  return (
    <div className="centro">
      <div className="card" style={{ maxWidth: 520 }}>
        <h2>Configuração pendente</h2>
        <p>Defina as variáveis do Supabase em <code>.env.local</code> (copie de <code>.env.example</code>):</p>
        <pre className="mono">VITE_SUPABASE_URL=…{'\n'}VITE_SUPABASE_ANON_KEY=…</pre>
        <p style={{ color: 'var(--suave)' }}>Depois reinicie o <code>npm run dev</code>.</p>
      </div>
    </div>
  );
}
