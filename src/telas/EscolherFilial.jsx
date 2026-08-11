import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Porta de entrada do fornecedor: qual estacionamento ele quer acessar agora.
// A escolha é gravada em `perfis.filial_ativa`, que é o que a RLS lê — por isso
// vale pro banco inteiro e não só pra tela.

/**
 * Troca a filial ativa e recarrega o app.
 *
 * O recarregamento é de propósito: cada tela carrega seus dados no mount, e
 * seguir navegando com dados da filial anterior em memória seria o caminho pra
 * lançar movimento no cliente errado.
 */
export async function trocarFilialAtiva(perfilId, filialId) {
  const { error } = await supabase.from('perfis').update({ filial_ativa: filialId }).eq('id', perfilId);
  if (error) return error.message;
  window.location.assign('/');
  return null;
}

export default function EscolherFilial({ perfil }) {
  const [filiais, setFiliais] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [entrando, setEntrando] = useState(null);

  useEffect(() => {
    supabase.from('filiais').select('id, codigo, nome_fantasia, razao_social, cidade, uf, ativo')
      .order('razao_social')
      .then(({ data, error }) => {
        if (error) setErro(error.message); else setFiliais(data || []);
        setCarregando(false);
      });
  }, []);

  async function entrar(f) {
    setErro(''); setEntrando(f.id);
    const msg = await trocarFilialAtiva(perfil.id, f.id);
    if (msg) { setErro(msg); setEntrando(null); }
  }

  return (
    <div className="centro">
      <div className="card" style={{ width: 'min(520px, 92vw)' }}>
        <h2>Qual estacionamento?</h2>
        <p className="suave">
          Olá, {perfil.nome}. Escolha o cliente que você quer acessar — dá pra trocar
          depois pelo seletor no topo da tela.
        </p>
        {erro && <div className="aviso">{erro}</div>}
        {carregando && <p className="suave">Carregando…</p>}
        <div className="tabela-scroll" style={{ maxHeight: '55vh' }}>
          <table>
            <tbody>
              {filiais.map((f) => (
                <tr key={f.id}>
                  <td>
                    {f.nome_fantasia || f.razao_social}
                    {!f.ativo && <span className="status status-cancelada" style={{ marginLeft: 6 }}>Inativo</span>}
                    <div className="suave" style={{ fontSize: 12 }}>
                      {f.codigo}{f.cidade ? ` · ${f.cidade}-${f.uf}` : ''}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-primary" disabled={!!entrando} onClick={() => entrar(f)}>
                      {entrando === f.id ? 'Entrando…' : 'Entrar'}
                    </button>
                  </td>
                </tr>
              ))}
              {!carregando && filiais.length === 0 && (
                <tr><td className="suave">Nenhum estacionamento cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </div>
    </div>
  );
}
