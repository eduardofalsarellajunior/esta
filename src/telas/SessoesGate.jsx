import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const INTERVALO_HEARTBEAT_MS = 45_000;
const INTERVALO_RETRY_BLOQUEADO_MS = 20_000;

/**
 * Trava o login quando a filial já está no limite de usuários simultâneos
 * (ver supabase/migrations/0032_limite_usuarios_simultaneos.sql e
 * api/sessao-heartbeat.js). Enquanto montado, manda um heartbeat periódico
 * pra manter a vaga — fechar a aba/perder rede libera sozinho depois de
 * alguns minutos, sem precisar de logout. Fornecedor nunca passa por aqui
 * (ver App.jsx).
 */
export default function SessoesGate({ children }) {
  const [estado, setEstado] = useState('carregando'); // carregando | liberado | bloqueado
  const [limite, setLimite] = useState(null);
  const intervaloRef = useRef(null);
  const retryRef = useRef(null);

  async function bater() {
    const { data: sessaoAuth } = await supabase.auth.getSession();
    if (!sessaoAuth.session) return; // deslogou nesse meio tempo — nada a fazer
    try {
      const resp = await fetch('/api/sessao-heartbeat', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessaoAuth.session.access_token}` },
      });
      const dados = await resp.json().catch(() => ({}));
      if (!resp.ok || !dados.liberado) {
        setLimite(dados.limite ?? null);
        setEstado('bloqueado');
        return;
      }
      setEstado('liberado');
    } catch {
      // Falha de rede não derruba quem já está dentro — só não renova esse
      // ciclo; o próximo heartbeat resolve sozinho.
      setEstado((e) => (e === 'carregando' ? 'liberado' : e));
    }
  }

  useEffect(() => {
    bater();
    intervaloRef.current = setInterval(bater, INTERVALO_HEARTBEAT_MS);
    return () => clearInterval(intervaloRef.current);
    // eslint-disable-next-line
  }, []);

  // Bloqueado: tenta de novo sozinho — a vaga pode abrir a qualquer momento
  // sem precisar de ação de quem está esperando.
  useEffect(() => {
    if (estado !== 'bloqueado') { clearInterval(retryRef.current); return; }
    retryRef.current = setInterval(bater, INTERVALO_RETRY_BLOQUEADO_MS);
    return () => clearInterval(retryRef.current);
    // eslint-disable-next-line
  }, [estado]);

  if (estado === 'carregando') return <div className="centro">Carregando…</div>;
  if (estado === 'liberado') return children;

  return (
    <div className="centro">
      <div className="card" style={{ width: 380 }}>
        <h2>Limite de usuários atingido</h2>
        <p className="suave">
          {limite
            ? `Este estacionamento já tem ${limite} usuário${limite === 1 ? '' : 's'} conectado${limite === 1 ? '' : 's'} ao mesmo tempo.`
            : 'Este estacionamento já atingiu o limite de usuários conectados ao mesmo tempo.'}
          {' '}Assim que alguém sair, o acesso libera sozinho.
        </p>
        <div className="linha-form" style={{ justifyContent: 'space-between', marginTop: 12 }}>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
          <button className="btn-primary" onClick={bater}>Tentar novamente</button>
        </div>
      </div>
    </div>
  );
}
