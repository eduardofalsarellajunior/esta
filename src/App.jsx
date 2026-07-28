import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { supabase, configurado } from './lib/supabase.js';
import Layout from './componentes/Layout.jsx';
import Patio from './telas/Patio.jsx';
import Caixa from './telas/Caixa.jsx';
import BI from './telas/BI.jsx';
import Precos from './telas/Precos.jsx';
import { Convenios, Formas, Vagas, Modelos, Servicos } from './telas/cadastros.jsx';
import Mensalistas from './telas/Mensalistas.jsx';
import { Receber, Pagar, Banco } from './telas/financeiro.jsx';
import Fiscal from './telas/Fiscal.jsx';
import Configuracoes from './telas/Configuracoes.jsx';
import Usuarios from './telas/Usuarios.jsx';

export default function App() {
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!configurado) { setCarregando(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSessao(data.session); setCarregando(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessao) { setPerfil(null); return; }
    supabase.from('perfis').select('*').eq('id', sessao.user.id).maybeSingle().then(({ data }) => setPerfil(data));
  }, [sessao]);

  if (!configurado) return <ConfigPendente />;
  if (carregando) return <div className="centro">Carregando…</div>;
  if (!sessao) return <Login />;
  if (!perfil) return (
    <div className="centro"><div className="card aviso" style={{ maxWidth: 520 }}>
      Usuário autenticado, mas sem <strong>perfil</strong> vinculado a uma filial.
      Crie um registro em <code>perfis</code> (id = id do usuário, filial_id da filial).
      <div style={{ marginTop: 12 }}><button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sair</button></div>
    </div></div>
  );
  if (!perfil.ativo) return (
    <div className="centro"><div className="card aviso" style={{ maxWidth: 520 }}>
      Este usuário está <strong>desativado</strong>. Fale com um supervisor para reativar.
      <div style={{ marginTop: 12 }}><button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sair</button></div>
    </div></div>
  );

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout perfil={perfil} />}>
          <Route index element={<Patio perfil={perfil} />} />
          <Route path="caixa" element={<Caixa perfil={perfil} />} />
          <Route path="bi" element={<BI perfil={perfil} />} />
          <Route path="precos" element={<Precos perfil={perfil} />} />
          <Route path="convenios" element={<Convenios perfil={perfil} />} />
          <Route path="mensalistas" element={<Mensalistas perfil={perfil} />} />
          <Route path="formas" element={<Formas perfil={perfil} />} />
          <Route path="vagas" element={<Vagas perfil={perfil} />} />
          <Route path="modelos" element={<Modelos perfil={perfil} />} />
          <Route path="servicos" element={<Servicos perfil={perfil} />} />
          <Route path="receber" element={<Receber perfil={perfil} />} />
          <Route path="pagar" element={<Pagar perfil={perfil} />} />
          <Route path="banco" element={<Banco perfil={perfil} />} />
          <Route path="fiscal" element={<Fiscal perfil={perfil} />} />
          <Route path="configuracoes" element={<Configuracoes perfil={perfil} />} />
          <Route path="usuarios" element={<Usuarios perfil={perfil} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  async function entrar(e) {
    e.preventDefault(); setErro(''); setOcupado(true);
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
        <button className="btn-primary" style={{ width: '100%' }} disabled={ocupado}>{ocupado ? '…' : 'Entrar'}</button>
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
        <p className="suave">Depois reinicie o <code>npm run dev</code>.</p>
      </div>
    </div>
  );
}
