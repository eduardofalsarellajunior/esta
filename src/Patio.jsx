import { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase.js';
import { carregarTabelasPreco, carregarPatio } from './lib/dados.js';
import { agoraHHMM, hojeISO, dataDeISO, fmtHora, fmtBRL } from './lib/tempo.js';
import { calcularTarifa } from '../packages/tarifacao/tarifacao.ts';

export default function Patio({ perfil }) {
  const [tabelas, setTabelas] = useState({});
  const [patio, setPatio] = useState([]);
  const [placa, setPlaca] = useState('');
  const [tipo, setTipo] = useState('');
  const [erro, setErro] = useState('');
  const [saindo, setSaindo] = useState(null); // { mov, resultado }

  const tipos = useMemo(() => Object.keys(tabelas).sort(), [tabelas]);

  async function recarregar() {
    try {
      const [t, p] = await Promise.all([carregarTabelasPreco(), carregarPatio()]);
      setTabelas(t); setPatio(p);
      if (!tipo && Object.keys(t).length) setTipo(Object.keys(t).sort()[0]);
    } catch (e) { setErro(e.message); }
  }
  useEffect(() => { recarregar(); }, []);

  async function darEntrada(e) {
    e.preventDefault();
    setErro('');
    const p = placa.trim().toUpperCase();
    if (!p || !tipo) return;
    const { error } = await supabase.from('movimentos').insert({
      filial_id: perfil.filial_id,
      placa: p,
      dt_entrada: hojeISO(),
      hr_entrada: agoraHHMM(),
      tipo_veic: tipo,
      tipo_mens: 'E',
      usuario_entrada: perfil.id,
    });
    if (error) {
      setErro(error.code === '23505' ? 'Essa placa já está no pátio.' : error.message);
      return;
    }
    setPlaca('');
    recarregar();
  }

  function prepararSaida(mov) {
    try {
      const resultado = calcularTarifa({
        tabelas,
        tipoVeic: mov.tipo_veic,
        movimento: {
          dtEntrada: dataDeISO(mov.dt_entrada),
          entrada: Number(mov.hr_entrada),
          dtSaida: new Date(),
          saida: agoraHHMM(),
        },
      });
      setSaindo({ mov, resultado });
    } catch (e) { setErro(e.message); }
  }

  async function confirmarSaida() {
    const { mov, resultado } = saindo;
    const { error } = await supabase.from('movimentos').update({
      dt_saida: hojeISO(),
      hr_saida: agoraHHMM(),
      valor: resultado.valor,
      valor_proporcional: resultado.valorProporcional,
      valor_convenio: resultado.valorConvenio,
      pontos_ganhos: resultado.pontos,
      usuario_saida: perfil.id,
    }).eq('id', mov.id);
    setSaindo(null);
    if (error) setErro(error.message); else recarregar();
  }

  return (
    <>
      {erro && <div className="card aviso">{erro}</div>}

      <div className="card">
        <h2>Entrada de veículo</h2>
        <form className="linha-form" onSubmit={darEntrada}>
          <div className="campo">
            <label>Placa</label>
            <input className="mono" value={placa} onChange={(e) => setPlaca(e.target.value)}
                   placeholder="ABC1D23" style={{ textTransform: 'uppercase', width: 140 }} />
          </div>
          <div className="campo">
            <label>Tabela</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button className="btn-primary" type="submit">Registrar entrada</button>
        </form>
      </div>

      <div className="card">
        <h2>No pátio ({patio.length})</h2>
        <table>
          <thead>
            <tr><th>Placa</th><th>Tabela</th><th>Entrada</th><th></th></tr>
          </thead>
          <tbody>
            {patio.map((m) => (
              <tr key={m.id}>
                <td><span className="placa mono">{m.placa}</span></td>
                <td>{m.tipo_veic}</td>
                <td className="mono">{m.dt_entrada.split('-').reverse().join('/')} {fmtHora(Number(m.hr_entrada))}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-primary" onClick={() => prepararSaida(m)}>Saída</button>
                </td>
              </tr>
            ))}
            {patio.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--suave)' }}>Pátio vazio.</td></tr>}
          </tbody>
        </table>
      </div>

      {saindo && (
        <div className="modal-bg" onClick={() => setSaindo(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Saída — <span className="placa mono">{saindo.mov.placa}</span></h2>
            <p className="mono" style={{ color: 'var(--suave)' }}>
              Entrada: {fmtHora(Number(saindo.mov.hr_entrada))} · Tempo: {fmtHora(saindo.resultado.tempoDecorrido)}
              {saindo.resultado.diarias > 0 && ` · ${saindo.resultado.diarias} diária(s)`}
            </p>
            <div className="grande">{fmtBRL(saindo.resultado.valor)}</div>
            {saindo.resultado.manual && <p className="aviso">Tempo fora das faixas — valor precisa ser conferido.</p>}
            <div className="linha-form" style={{ justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setSaindo(null)}>Cancelar</button>
              <button className="btn-primary" onClick={confirmarSaida}>Confirmar saída</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
