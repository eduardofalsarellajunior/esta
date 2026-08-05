import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { ROTAS_OPERADOR } from '../lib/acesso.js';

const GRUPOS = [
  { titulo: 'Operação', itens: [
    { to: '/', rotulo: 'Pátio', fim: true },
    { to: '/caixa', rotulo: 'Caixa' },
    { to: '/bi', rotulo: 'BI / Painel' },
  ]},
  { titulo: 'Cadastros', itens: [
    { to: '/precos', rotulo: 'Tabelas de preço' },
    { to: '/convenios', rotulo: 'Convênios' },
    { to: '/mensalistas', rotulo: 'Mensalistas' },
    { to: '/formas', rotulo: 'Formas de pagamento' },
    { to: '/modelos', rotulo: 'Modelos' },
    { to: '/servicos', rotulo: 'Serviços' },
    { to: '/importar', rotulo: 'Importar do legado (.dbf)' },
  ]},
  { titulo: 'Fiscal', itens: [
    { to: '/fiscal', rotulo: 'NFS-e / RPS' },
  ]},
  { titulo: 'Configurações', itens: [
    { to: '/configuracoes', rotulo: 'Dados do estacionamento' },
    { to: '/usuarios', rotulo: 'Usuários' },
  ]},
];

export default function Layout({ perfil }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [nomeFilial, setNomeFilial] = useState('');
  const location = useLocation();
  const supervisor = perfil.papel === 'supervisor';

  useEffect(() => {
    supabase.from('filiais').select('nome_fantasia').maybeSingle()
      .then(({ data }) => setNomeFilial(data?.nome_fantasia || ''));
  }, []);

  if (!supervisor && !ROTAS_OPERADOR.includes(location.pathname)) {
    return <Navigate to="/" replace />;
  }

  const grupos = supervisor ? GRUPOS : GRUPOS
    .map((g) => ({ ...g, itens: g.itens.filter((i) => ROTAS_OPERADOR.includes(i.to)) }))
    .filter((g) => g.itens.length > 0);

  return (
    <div className="app">
      <aside className={'lateral' + (menuAberto ? ' aberto' : '')}>
        <div className="marca">esta <span className="ambar">·PDV</span></div>
        {grupos.map((g) => (
          <div key={g.titulo} className="nav-grupo">
            <div className="nav-titulo">{g.titulo}</div>
            {g.itens.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.fim}
                onClick={() => setMenuAberto(false)}
                className={({ isActive }) => 'nav-item' + (isActive ? ' ativo' : '')}>
                {i.rotulo}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>
      {menuAberto && <div className="menu-fundo" onClick={() => setMenuAberto(false)} />}
      <main className="conteudo">
        {nomeFilial && <div className="topo-filial">{nomeFilial}</div>}
        <header className="topo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="menu-toggle btn-ghost" onClick={() => setMenuAberto((v) => !v)} aria-label="Menu">☰</button>
            <span className="filial-nome">{perfil.nome} · {perfil.papel}</span>
          </div>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
        </header>
        <div className="container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
