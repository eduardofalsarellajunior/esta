import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

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
    { to: '/vagas', rotulo: 'Vagas' },
    { to: '/modelos', rotulo: 'Modelos' },
  ]},
  { titulo: 'Financeiro', itens: [
    { to: '/receber', rotulo: 'Contas a receber' },
    { to: '/pagar', rotulo: 'Contas a pagar' },
    { to: '/banco', rotulo: 'Banco / caixa' },
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
  return (
    <div className="app">
      <aside className={'lateral' + (menuAberto ? ' aberto' : '')}>
        <div className="marca">esta <span className="ambar">·PDV</span></div>
        {GRUPOS.map((g) => (
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
