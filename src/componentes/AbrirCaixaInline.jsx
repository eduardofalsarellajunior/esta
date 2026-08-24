import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * Formulário mínimo de abertura de caixa, embutido em qualquer fluxo de
 * recebimento (Vlr. Antecipado, Venda Produtos, Receber mensalidade, saída
 * do pátio, antecipado da reserva) — em vez de deixar passar "sem caixa
 * aberto" com só um aviso passivo, pede o troco ali na hora e libera o
 * recebimento já dentro do caixa certo (ver 0043_caixa_numero_e_abertura.sql
 * pro número sequencial, preenchido sozinho na gravação).
 */
export default function AbrirCaixaInline({ perfil, onAberto }) {
  const [abertura, setAbertura] = useState('0');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function abrir(e) {
    e.preventDefault();
    setSalvando(true); setErro('');
    const { data, error } = await supabase.from('caixas').insert({
      filial_id: perfil.filial_id, operador_id: perfil.id, valor_abertura: Number(abertura || 0),
    }).select().single();
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    onAberto(data);
  }

  return (
    <form onSubmit={abrir}>
      <p className="aviso" style={{ fontSize: 12, marginBottom: 8 }}>
        Você não tem caixa aberto — informe o troco inicial pra abrir e continuar com o recebimento.
      </p>
      <div className="linha-form" style={{ alignItems: 'flex-end', marginBottom: 4 }}>
        <div className="campo" style={{ flex: 1 }}>
          <label>Troco de abertura</label>
          <input type="number" step="0.01" value={abertura} onChange={(e) => setAbertura(e.target.value)} autoFocus />
        </div>
        <button className="btn-primary" type="submit" disabled={salvando}>{salvando ? '…' : 'Abrir caixa e continuar'}</button>
      </div>
      {erro && <p className="aviso">{erro}</p>}
    </form>
  );
}
