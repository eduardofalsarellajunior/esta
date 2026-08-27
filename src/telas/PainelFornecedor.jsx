import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Só o fornecedor vê essa tela (gate em App.jsx) — métricas de uso pra
// decidir quando um cliente precisa de upgrade de plano (Plate Recognizer,
// espaço no banco, etc.) antes que algo pare de funcionar pra ele. Ver
// supabase/migrations/0033_painel_uso.sql.

const MINUTOS_ONLINE = 2; // mesmo limiar de api/sessao-heartbeat.js

function fmtBytes(bytes) {
  if (bytes == null) return '—';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
}

export default function PainelFornecedor() {
  const [filiais, setFiliais] = useState(null);
  const [online, setOnline] = useState({}); // filial_id -> quantidade
  const [tamanhoBanco, setTamanhoBanco] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    setCarregando(true); setErro('');
    const limiar = new Date(Date.now() - MINUTOS_ONLINE * 60 * 1000).toISOString();
    const [rFiliais, rSessoes, rTamanho] = await Promise.all([
      supabase.from('filiais')
        .select('id, nome_fantasia, numero_cliente, contagem_reconhecimentos_placa, contagem_acessos')
        .order('nome_fantasia'),
      supabase.from('sessoes_ativas').select('filial_id').gt('ultimo_ping', limiar),
      supabase.rpc('tamanho_banco_bytes'),
    ]);
    if (rFiliais.error) { setErro(rFiliais.error.message); setCarregando(false); return; }
    setFiliais(rFiliais.data || []);
    const contagem = {};
    for (const s of rSessoes.data || []) contagem[s.filial_id] = (contagem[s.filial_id] || 0) + 1;
    setOnline(contagem);
    setTamanhoBanco(rTamanho.error ? null : rTamanho.data);
    setCarregando(false);
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);

  async function zerar(filialId, campo, rotulo) {
    if (!window.confirm(`Zerar "${rotulo}" desta filial?`)) return;
    const { error } = await supabase.from('filiais').update({ [campo]: 0 }).eq('id', filialId);
    if (error) { setErro(error.message); return; }
    carregar();
  }

  return (
    <div className="card">
      <div className="card-cab">
        <div>
          <h2>Painel de uso</h2>
          <p className="suave">
            Métricas pra saber quando algum cliente está perto de bater um limite externo
            (leituras de placa, espaço em disco) — pra decidir upgrade de plano com antecedência.
          </p>
        </div>
        <button className="btn-ghost" onClick={carregar} disabled={carregando}>
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>
      {erro && <div className="aviso">{erro}</div>}
      <p className="suave">
        Tamanho do banco (sistema todo): <strong>{fmtBytes(tamanhoBanco)}</strong>
      </p>
      {carregando && !filiais ? 'Carregando…' : (
        <div className="tabela-scroll">
          <table>
            <thead>
              <tr>
                <th>Filial</th>
                <th>Sessões ativas agora</th>
                <th>Reconhecimentos de placa</th>
                <th>Acessos</th>
              </tr>
            </thead>
            <tbody>
              {(filiais || []).map((f) => (
                <tr key={f.id}>
                  <td>{f.numero_cliente ? `${f.numero_cliente} · ` : ''}{f.nome_fantasia || '—'}</td>
                  <td>{online[f.id] || 0}</td>
                  <td>
                    {f.contagem_reconhecimentos_placa}{' '}
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }}
                      onClick={() => zerar(f.id, 'contagem_reconhecimentos_placa', 'Reconhecimentos de placa')}>
                      Zerar
                    </button>
                  </td>
                  <td>
                    {f.contagem_acessos}{' '}
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }}
                      onClick={() => zerar(f.id, 'contagem_acessos', 'Acessos')}>
                      Zerar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
