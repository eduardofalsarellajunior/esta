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
];

export default function Layout({ perfil }) {
  return (
    <div className="app">
      <aside className="lateral">
        <div className="marca">esta <span className="ambar">·PDV</span></div>
        {GRUPOS.map((g) => (
          <div key={g.titulo} className="nav-grupo">
            <div className="nav-titulo">{g.titulo}</div>
            {g.itens.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.fim}
                className={({ isActive }) => 'nav-item' + (isActive ? ' ativo' : '')}>
                {i.rotulo}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>
      <main className="conteudo">
        <header className="topo">
          <span className="filial-nome">{perfil.nome} · {perfil.papel}</span>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
        </header>
        <div className="container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
