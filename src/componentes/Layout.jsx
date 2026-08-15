import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PAPEIS, podeAcessar, ehFornecedor } from '../lib/acesso.js';
import { trocarFilialAtiva } from '../telas/EscolherFilial.jsx';
import { imprimePedidosDaCabine } from '../lib/preferenciasNavegador.js';
import { imprimirTicket } from './Ticket.jsx';

const INTERVALO_VERIFICACAO_MS = 4000;

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
    { to: '/fiscal', rotulo: 'NFS-e / RPS/DPS' },
  ]},
  { titulo: 'Configurações', itens: [
    { to: '/configuracoes', rotulo: 'Dados do estacionamento' },
    { to: '/usuarios', rotulo: 'Usuários' },
    { to: '/modelos-ticket', rotulo: 'Modelos de ticket' },
  ]},
];

export default function Layout({ perfil }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [nomeFilial, setNomeFilial] = useState('');
  const [filiais, setFiliais] = useState([]); // só o fornecedor tem mais de uma
  const location = useLocation();

  useEffect(() => {
    // Fornecedor enxerga todas as filiais (é o que alimenta o seletor); os
    // demais enxergam só a própria, então o maybeSingle continua valendo.
    if (ehFornecedor(perfil)) {
      supabase.from('filiais').select('id, nome_fantasia, razao_social').order('razao_social')
        .then(({ data }) => {
          setFiliais(data || []);
          const atual = (data || []).find((f) => f.id === perfil.filial_ativa);
          setNomeFilial(atual?.nome_fantasia || atual?.razao_social || '');
        });
      return;
    }
    supabase.from('filiais').select('nome_fantasia').maybeSingle()
      .then(({ data }) => setNomeFilial(data?.nome_fantasia || ''));
  }, [perfil]);

  /**
   * Pedidos de impressão vindos do celular (ver Ticket.jsx e
   * supabase/migrations/0023_print_jobs.sql). Só roda quando este navegador
   * marcou "imprime pedidos da cabine" em Configurações — normalmente só o
   * navegador kiosk fixo da cabine (ver docs/CABINE.md). Reaproveita o mesmo
   * imprimirTicket() que já imprime silencioso ali, nenhuma lógica nova de
   * impressão.
   */
  useEffect(() => {
    if (!imprimePedidosDaCabine()) return;
    let cancelado = false;
    let filial = null;

    async function verificar() {
      if (!filial) {
        const { data } = await supabase.from('filiais').select('nome_fantasia, endereco, cnpj')
          .eq('id', perfil.filial_id).maybeSingle();
        filial = data;
      }
      const { data: pendentes } = await supabase.from('print_jobs').select('*')
        .eq('filial_id', perfil.filial_id).eq('status', 'pendente').order('criado_em');
      for (const job of pendentes || []) {
        if (cancelado) return;
        // Reivindica antes de imprimir (update condicional): se por engano
        // duas abas tiverem a flag ligada, só uma imprime cada pedido.
        const { data: reivindicado } = await supabase.from('print_jobs')
          .update({ status: 'impresso', impresso_em: new Date().toISOString() })
          .eq('id', job.id).eq('status', 'pendente').select().maybeSingle();
        if (!reivindicado) continue;
        try {
          imprimirTicket(job.ticket, filial);
        } catch (e) {
          // Não captura "pop-up bloqueado" (imprimirTicket só alerta, não lança) —
          // só erros inesperados (ex.: ticket malformado).
          await supabase.from('print_jobs').update({ status: 'erro', erro: e.message }).eq('id', job.id);
        }
      }
    }

    verificar();
    const id = setInterval(verificar, INTERVALO_VERIFICACAO_MS);
    return () => { cancelado = true; clearInterval(id); };
  }, [perfil.filial_id]);

  if (!podeAcessar(perfil, location.pathname)) {
    return <Navigate to="/" replace />;
  }

  const grupos = GRUPOS
    .map((g) => ({ ...g, itens: g.itens.filter((i) => podeAcessar(perfil, i.to)) }))
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
        {/* Pro fornecedor o nome do cliente vira seletor: é a informação mais
            importante da tela, já que ele opera vários estacionamentos. */}
        {ehFornecedor(perfil) ? (
          <div className="topo-filial">
            <select value={perfil.filial_ativa || ''} style={{ padding: '2px 8px', fontSize: 'inherit' }}
              onChange={(e) => trocarFilialAtiva(perfil.id, e.target.value)}>
              {filiais.map((f) => (
                <option key={f.id} value={f.id}>{f.nome_fantasia || f.razao_social}</option>
              ))}
            </select>
          </div>
        ) : (
          nomeFilial && <div className="topo-filial">{nomeFilial}</div>
        )}
        <header className="topo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="menu-toggle btn-ghost" onClick={() => setMenuAberto((v) => !v)} aria-label="Menu">☰</button>
            <span className="filial-nome">{perfil.nome} · {PAPEIS[perfil.papel] || perfil.papel}</span>
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
