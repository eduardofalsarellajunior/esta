import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { obterTema, aplicarTema } from '../lib/tema.js';

// Dados do estacionamento (nome/endereço/CNPJ) para o cabeçalho dos tickets.
// A RLS de `filiais` já restringe UPDATE a supervisores (ver 0002_rls.sql).
export default function Configuracoes({ perfil }) {
  const [filial, setFilial] = useState(null);
  const [erro, setErro] = useState('');
  const [salvo, setSalvo] = useState(false);
  const [tema, setTema] = useState(obterTema());
  const podeEditar = perfil.papel === 'supervisor';

  function mudarTema(novoTema) {
    aplicarTema(novoTema);
    setTema(novoTema);
  }

  async function carregar() {
    const { data, error } = await supabase.from('filiais').select('*').eq('id', perfil.filial_id).maybeSingle();
    if (error) setErro(error.message); else setFilial(data);
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvo(false);
    const { error } = await supabase.from('filiais').update({
      nome_fantasia: filial.nome_fantasia || null,
      endereco: filial.endereco || null,
      cnpj: filial.cnpj || null,
    }).eq('id', filial.id);
    if (error) setErro(error.message); else setSalvo(true);
  }

  return (
    <>
      <div className="card">
        <h2>Aparência</h2>
        <p className="suave">Preferência pessoal deste navegador — não afeta outros usuários/dispositivos.</p>
        <div className="campo" style={{ maxWidth: 220 }}>
          <label>Tema</label>
          <select value={tema} onChange={(e) => mudarTema(e.target.value)}>
            <option value="escuro">Escuro</option>
            <option value="claro">Claro</option>
          </select>
        </div>
      </div>

      <div className="card">
        <h2>Dados do estacionamento</h2>
        <p className="suave">Aparecem no cabeçalho impresso dos tickets de entrada e saída.</p>
        {erro && <div className="aviso">{erro}</div>}
        {!filial ? 'Carregando…' : (
          <>
            {salvo && <p className="ok-txt">Salvo.</p>}
            <form onSubmit={salvar}>
              <div className="campo" style={{ marginBottom: 10, maxWidth: 420 }}>
                <label>Nome</label>
                <input value={filial.nome_fantasia || ''} disabled={!podeEditar}
                  onChange={(e) => setFilial({ ...filial, nome_fantasia: e.target.value })} />
              </div>
              <div className="campo" style={{ marginBottom: 10, maxWidth: 420 }}>
                <label>Endereço</label>
                <input value={filial.endereco || ''} disabled={!podeEditar}
                  onChange={(e) => setFilial({ ...filial, endereco: e.target.value })} />
              </div>
              <div className="campo" style={{ marginBottom: 10, maxWidth: 420 }}>
                <label>CNPJ</label>
                <input value={filial.cnpj || ''} disabled={!podeEditar}
                  onChange={(e) => setFilial({ ...filial, cnpj: e.target.value })} />
              </div>
              {podeEditar
                ? <button className="btn-primary" type="submit">Salvar</button>
                : <p className="suave">Só supervisores podem editar.</p>}
            </form>
          </>
        )}
      </div>
    </>
  );
}
