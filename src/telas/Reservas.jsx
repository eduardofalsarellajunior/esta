import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { hojeISO, fmtDataBR } from '../lib/tempo.js';
import { tiposDeVaga, capacidadePorDia, diasSemVaga } from '../lib/reservas.js';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ROTULO_PERIODO = { dia_todo: 'Dia todo', manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
const ROTULO_STATUS = { confirmada: 'Confirmada', cancelada: 'Cancelada', no_show: 'Não veio', concluida: 'Concluída' };

function anoMesAtual() {
  const [ano, mes] = hojeISO().split('-');
  return `${ano}-${mes}`;
}

/** Grade de células do mês (com `null` de preenchimento antes do dia 1), começando no domingo. */
function celulasDoMes(anoMes) {
  const [ano, mes] = anoMes.split('-').map(Number);
  const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay();
  const totalDias = new Date(ano, mes, 0).getDate();
  const celulas = Array(primeiroDiaSemana).fill(null);
  for (let d = 1; d <= totalDias; d++) celulas.push(`${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  return celulas;
}

function mudarAnoMes(anoMes, delta) {
  const [ano, mes] = anoMes.split('-').map(Number);
  const d = new Date(ano, mes - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Calendário mensal: pra cada dia, quantas vagas de cada tipo (coberta/
// descoberta, texto livre — ver Cadastros → Vagas/boxes) ainda sobram até
// esgotar. Clicar num dia mostra as reservas que o cobrem + botão pra
// reservar. Mensalistas e avulsos não entram nessa conta — só reservas
// confirmadas (ver src/lib/reservas.js).
export default function Reservas({ perfil }) {
  const [anoMes, setAnoMes] = useState(anoMesAtual());
  const [tipos, setTipos] = useState([]);
  const [capacidade, setCapacidade] = useState({});
  const [diaSelecionado, setDiaSelecionado] = useState(null);
  const [reservasDoDia, setReservasDoDia] = useState([]);
  const [modalNova, setModalNova] = useState(null);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(false);

  const celulas = useMemo(() => celulasDoMes(anoMes), [anoMes]);

  async function carregarMes() {
    setCarregando(true); setErro('');
    const primeiro = `${anoMes}-01`;
    const ultimo = celulas.filter(Boolean).at(-1) || primeiro;
    const [ts, mapa] = await Promise.all([tiposDeVaga(supabase), capacidadePorDia(supabase, primeiro, ultimo)]);
    setTipos(ts);
    setCapacidade(mapa);
    setCarregando(false);
  }
  useEffect(() => { carregarMes(); /* eslint-disable-next-line */ }, [anoMes]);

  async function carregarReservasDoDia(dia) {
    const { data, error } = await supabase.from('reservas').select('*')
      .lte('data_inicio', dia).gte('data_fim', dia).order('status').order('tipo');
    if (error) { setErro(error.message); return; }
    setReservasDoDia(data || []);
  }

  function selecionarDia(dia) {
    if (!dia) return;
    setDiaSelecionado((d) => (d === dia ? null : dia));
    setMsg('');
    if (dia !== diaSelecionado) carregarReservasDoDia(dia);
  }

  function abrirNovaReserva() {
    setModalNova({
      tipo: tipos[0] || '', periodo: 'dia_todo',
      data_inicio: diaSelecionado || hojeISO(), data_fim: diaSelecionado || hojeISO(),
      nome: '', telefone: '', placa: '', observacao: '',
      diasSemVaga: null, confirmando: false,
    });
    setErro('');
  }

  async function tentarSalvarReserva(forcar = false) {
    const m = modalNova;
    if (m.data_inicio < hojeISO()) { setErro('Não é possível reservar pra uma data antes de hoje.'); return; }
    if (m.data_fim < m.data_inicio) { setErro('A data final não pode ser antes da data inicial.'); return; }
    if (!m.tipo) { setErro('Escolha o tipo de vaga.'); return; }

    if (!forcar) {
      const mapa = await capacidadePorDia(supabase, m.data_inicio, m.data_fim);
      const dias = diasSemVaga(mapa, m.tipo, m.data_inicio, m.data_fim);
      if (dias.length) { setModalNova({ ...m, diasSemVaga: dias }); return; }
    }

    setErro('');
    const { error } = await supabase.from('reservas').insert({
      filial_id: perfil.filial_id, tipo: m.tipo, periodo: m.periodo,
      data_inicio: m.data_inicio, data_fim: m.data_fim,
      nome: m.nome || null, telefone: m.telefone || null, placa: m.placa || null,
      observacao: m.observacao || null, criado_por: perfil.id,
    });
    if (error) { setErro(error.message); return; }
    setModalNova(null);
    setMsg('Reserva criada.');
    carregarMes();
    if (diaSelecionado) carregarReservasDoDia(diaSelecionado);
  }

  async function mudarStatus(reserva, status) {
    if (status === 'cancelada' && !window.confirm('Excluir esta reserva? Os dias voltam a ficar disponíveis.')) return;
    const { error } = await supabase.from('reservas').update({ status }).eq('id', reserva.id);
    if (error) { setErro(error.message); return; }
    carregarMes();
    if (diaSelecionado) carregarReservasDoDia(diaSelecionado);
  }

  const [ano, mesNum] = anoMes.split('-').map(Number);
  const nomeMes = new Date(ano, mesNum - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <>
      <div className="card">
        <div className="card-cab">
          <div>
            <h2>Reservas de vaga</h2>
            <p className="suave">
              Por dia, quantas vagas de cada tipo ainda sobram até esgotar — mensalistas e avulsos
              não entram nessa conta, só reservas confirmadas.
            </p>
          </div>
          <button className="btn-primary" onClick={abrirNovaReserva} disabled={!tipos.length}>+ Nova reserva</button>
        </div>
        {!tipos.length && !carregando && (
          <p className="aviso">
            Nenhum tipo de vaga cadastrado ainda — cadastre em Cadastros → Vagas/boxes
            (ex.: algumas com tipo "coberta", outras "descoberta") antes de reservar.
          </p>
        )}
        {erro && <div className="aviso">{erro}</div>}
        {msg && <div className="ok-txt">{msg}</div>}

        <div className="linha-form" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <button className="btn-ghost" onClick={() => setAnoMes((a) => mudarAnoMes(a, -1))}>‹ Mês anterior</button>
          <strong style={{ textTransform: 'capitalize' }}>{carregando ? 'Carregando…' : nomeMes}</strong>
          <button className="btn-ghost" onClick={() => setAnoMes((a) => mudarAnoMes(a, 1))}>Mês seguinte ›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="suave" style={{ textAlign: 'center', fontSize: 12 }}>{d}</div>
          ))}
          {celulas.map((dia, i) => (
            <div key={dia || `vazio-${i}`}
              className={dia ? 'linha-clicavel' + (dia === diaSelecionado ? ' linha-selecionada' : '') : ''}
              onClick={() => selecionarDia(dia)}
              style={{ minHeight: 56, borderRadius: 8, padding: 6, border: dia ? '1px solid var(--linha)' : 'none' }}>
              {dia && (
                <>
                  <div className="mono" style={{ fontSize: 12 }}>{Number(dia.slice(-2))}</div>
                  {tipos.map((t) => (
                    <div key={t} className="suave" style={{ fontSize: 11 }}>
                      {t}: <strong className={capacidade[dia]?.[t] <= 0 ? 'aviso-btn' : undefined}>{capacidade[dia]?.[t] ?? '—'}</strong>
                    </div>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {diaSelecionado && (
        <div className="card">
          <h2>Reservas em {fmtDataBR(diaSelecionado)}</h2>
          <table>
            <thead><tr><th>Tipo</th><th>Período</th><th>Cliente</th><th>Placa</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {reservasDoDia.map((r) => (
                <tr key={r.id}>
                  <td>{r.tipo}</td>
                  <td>{ROTULO_PERIODO[r.periodo] || r.periodo}</td>
                  <td>{r.nome || '—'}{r.telefone ? ` · ${r.telefone}` : ''}</td>
                  <td className="mono">{r.placa || '—'}</td>
                  <td>{ROTULO_STATUS[r.status] || r.status}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.status === 'confirmada' && (
                      <>
                        <button className="btn-ghost" onClick={() => mudarStatus(r, 'concluida')}>Concluída</button>
                        <button className="btn-ghost" onClick={() => mudarStatus(r, 'no_show')}>Não veio</button>
                        <button className="btn-ghost aviso-btn" onClick={() => mudarStatus(r, 'cancelada')}>Excluir</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {reservasDoDia.length === 0 && <tr><td colSpan={6} className="suave">Nenhuma reserva cobre este dia.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {modalNova && (
        <div className="modal-bg" onClick={() => setModalNova(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <h2>Nova reserva</h2>
            <div className="linha-form" style={{ marginBottom: 10 }}>
              <div className="campo" style={{ flex: 1 }}>
                <label>Tipo de vaga</label>
                <select value={modalNova.tipo} onChange={(e) => setModalNova({ ...modalNova, tipo: e.target.value, diasSemVaga: null })}>
                  {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="campo" style={{ flex: 1 }}>
                <label>Período</label>
                <select value={modalNova.periodo} onChange={(e) => setModalNova({ ...modalNova, periodo: e.target.value })}>
                  {Object.entries(ROTULO_PERIODO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="linha-form" style={{ marginBottom: 10 }}>
              <div className="campo" style={{ flex: 1 }}>
                <label>De</label>
                <input type="date" min={hojeISO()} value={modalNova.data_inicio}
                  onChange={(e) => setModalNova({ ...modalNova, data_inicio: e.target.value, diasSemVaga: null })} />
              </div>
              <div className="campo" style={{ flex: 1 }}>
                <label>Até</label>
                <input type="date" min={modalNova.data_inicio || hojeISO()} value={modalNova.data_fim}
                  onChange={(e) => setModalNova({ ...modalNova, data_fim: e.target.value, diasSemVaga: null })} />
              </div>
            </div>
            <div className="campo" style={{ marginBottom: 10 }}>
              <label>Nome (opcional)</label>
              <input value={modalNova.nome} onChange={(e) => setModalNova({ ...modalNova, nome: e.target.value })} />
            </div>
            <div className="linha-form" style={{ marginBottom: 10 }}>
              <div className="campo" style={{ flex: 1 }}>
                <label>Telefone (opcional)</label>
                <input value={modalNova.telefone} onChange={(e) => setModalNova({ ...modalNova, telefone: e.target.value })} />
              </div>
              <div className="campo" style={{ flex: 1 }}>
                <label>Placa (opcional)</label>
                <input className="mono" style={{ textTransform: 'uppercase' }} value={modalNova.placa}
                  onChange={(e) => setModalNova({ ...modalNova, placa: e.target.value.toUpperCase() })} />
              </div>
            </div>
            <div className="campo" style={{ marginBottom: 10 }}>
              <label>Observação (opcional)</label>
              <input value={modalNova.observacao} onChange={(e) => setModalNova({ ...modalNova, observacao: e.target.value })} />
            </div>
            {erro && <p className="aviso">{erro}</p>}
            {modalNova.diasSemVaga && (
              <div className="aviso" style={{ marginBottom: 10 }}>
                Sem vaga "{modalNova.tipo}" em: {modalNova.diasSemVaga.map(fmtDataBR).join(', ')}.
                Ainda dá pra reservar mesmo assim, se for o caso.
              </div>
            )}
            <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => setModalNova(null)}>Cancelar</button>
              {modalNova.diasSemVaga ? (
                <button className="btn-primary" onClick={() => tentarSalvarReserva(true)}>Reservar mesmo assim</button>
              ) : (
                <button className="btn-primary" onClick={() => tentarSalvarReserva(false)}>Reservar</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
