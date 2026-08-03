import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { carregarModelosVeiculo } from '../lib/dados.js';
import { normalizar, REGEX_PLACA } from '../lib/texto.js';
import { hojeISO, somarUmMes, fmtDataBR, fmtBRL } from '../lib/tempo.js';
import { TicketModal } from '../componentes/Ticket.jsx';
import CapturaPlaca from '../componentes/CapturaPlaca.jsx';

// Mensalistas/hóspedes + os veículos de cada um (1:N) e a quantidade de vagas
// contratadas simultâneas. Se mais veículos do que isso estiverem no pátio ao
// mesmo tempo, os excedentes entram como avulso (checado em Patio.jsx).
// O botão "Receber" grava o pagamento da mensalidade (mensalista_pagamentos),
// avança o próximo pagamento um mês no cadastro e imprime o comprovante.
export default function Mensalistas({ perfil }) {
  const [lista, setLista] = useState([]);
  const [sel, setSel] = useState(null); // mensalista cujos veículos aparecem embaixo
  const [editando, setEditando] = useState(null); // objeto no modal de cabeçalho (null = fechado)
  const [recebendo, setRecebendo] = useState(null); // mensalista no modal de recebimento
  const [formas, setFormas] = useState([]);
  const [filial, setFilial] = useState(null); // cabeçalho do comprovante
  const [caixaAberto, setCaixaAberto] = useState(null); // só pra avisar no modal de recebimento
  const [ticket, setTicket] = useState(null);
  const [celularTicket, setCelularTicket] = useState('');
  const [erro, setErro] = useState('');

  async function carregar() {
    const { data, error } = await supabase.from('mensalistas').select('*').order('codigo');
    if (error) setErro(error.message); else setLista(data);
  }
  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    supabase.from('formas_pagamento').select('*').eq('ativo', true).order('codigo')
      .then(({ data }) => setFormas(data || []));
    supabase.from('filiais').select('nome_fantasia, endereco, cnpj').eq('id', perfil.filial_id).maybeSingle()
      .then(({ data }) => setFilial(data));
    supabase.from('caixas').select('id').eq('operador_id', perfil.id).eq('status', 'aberto').maybeSingle()
      .then(({ data }) => setCaixaAberto(data));
  }, [perfil.filial_id, perfil.id]);

  async function salvar(m) {
    setErro('');
    const payload = {
      filial_id: perfil.filial_id, codigo: m.codigo, razao: m.razao,
      tipo_mens: m.tipo_mens || 'I', telefone: m.telefone || null, celular: m.celular || null,
      email: m.email || null, box: m.box || null,
      dia_venc: m.dia_venc ? Number(m.dia_venc) : null,
      tolerancia_dias: Number(m.tolerancia_dias || 0), qte_vagas: Number(m.qte_vagas || 1),
      valor_mensalidade: Number(m.valor_mensalidade || 0),
      proximo_pagamento: m.proximo_pagamento || null,
      ativo: m.ativo ?? true,
    };
    const res = m.id
      ? await supabase.from('mensalistas').update(payload).eq('id', m.id).select().single()
      : await supabase.from('mensalistas').insert(payload).select().single();
    if (res.error) { setErro(res.error.message); return; }
    setEditando(null); setSel(res.data); carregar();
  }

  async function excluir(id) {
    if (!window.confirm('Excluir este mensalista? Os veículos cadastrados dele também são removidos.')) return;
    setErro('');
    const { error } = await supabase.from('mensalistas').delete().eq('id', id);
    if (error) { setErro(error.message); return; }
    setEditando(null); setSel(null); carregar();
  }

  // Grava o evento de recebimento e avança o próximo pagamento no cadastro.
  async function receber({ mensalista, dtPagamento, valor, forma, proximo, observacao }) {
    setErro('');
    // Liga ao caixa aberto do operador (se houver), para entrar no fechamento.
    const { data: cx } = await supabase.from('caixas').select('id')
      .eq('operador_id', perfil.id).eq('status', 'aberto').maybeSingle();
    const { error: errPag } = await supabase.from('mensalista_pagamentos').insert({
      filial_id: perfil.filial_id, mensalista_id: mensalista.id,
      dt_pagamento: dtPagamento, valor_pago: Number(valor), forma_pagamento: forma,
      proximo_pagamento: proximo, proximo_anterior: mensalista.proximo_pagamento || null,
      observacao: observacao?.trim() || null, recebido_por: perfil.id,
      caixa_id: cx?.id ?? null,
    });
    if (errPag) { setErro(errPag.message); return; }
    const { error: errCad } = await supabase.from('mensalistas')
      .update({ proximo_pagamento: proximo }).eq('id', mensalista.id);
    if (errCad) { setErro(`Pagamento gravado, mas o cadastro não foi atualizado: ${errCad.message}`); }
    // Reflete a nova data no selecionado (recarrega o histórico logo abaixo).
    setSel((s) => (s && s.id === mensalista.id ? { ...s, proximo_pagamento: proximo } : s));

    setTicket(ticketRecebimento({
      mensalista, dtPagamento, valor, proximo,
      formaDescricao: descricaoForma(formas, forma), operador: perfil.nome,
    }));
    setCelularTicket(mensalista.celular || '');
    setRecebendo(null);
    carregar();
  }

  return (
    <>
      <div className="card">
        <div className="card-cab">
          <div><h2>Mensalistas</h2>
            <p className="suave">Mensalistas/hóspedes, com os veículos e a quantidade de vagas contratadas simultâneas.</p></div>
          <button className="btn-primary" onClick={() => setEditando({ novo: true })}>+ Novo</button>
        </div>
        {erro && <div className="aviso">{erro}</div>}
        <div className="tabela-scroll">
          <table>
            <thead><tr>
              <th>Código</th><th>Nome</th><th>Tipo</th><th>Box</th><th>Vagas</th>
              <th>Mensalidade</th><th>Próx. pagamento</th><th>Ativo</th><th></th>
            </tr></thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id}>
                  <td className="mono">{m.codigo}</td>
                  <td>{m.razao}</td>
                  <td>{rotuloTipoMens(m.tipo_mens)}</td>
                  <td>{m.box || '—'}</td>
                  <td>{m.qte_vagas}</td>
                  <td>{Number(m.valor_mensalidade || 0) > 0 ? fmtBRL(Number(m.valor_mensalidade)) : '—'}</td>
                  <td className="mono">
                    {fmtDataBR(m.proximo_pagamento)}
                    {vencido(m.proximo_pagamento) && <span className="status status-cancelada" style={{ marginLeft: 6 }}>Vencida</span>}
                  </td>
                  <td>{m.ativo ? 'Sim' : 'Não'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn-ghost" onClick={() => { setSel(m); setEditando(m); }}>Editar</button>
                    <button className="btn-primary" onClick={() => { setSel(m); setRecebendo(m); }}>Receber</button>
                  </td>
                </tr>
              ))}
              {lista.length === 0 && <tr><td colSpan={9} className="suave">Nenhum mensalista.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {sel && <Veiculos perfil={perfil} mensalista={sel} />}
      {sel && (
        <Recebimentos mensalista={sel} formas={formas}
          onReimprimir={(p) => {
            setTicket(ticketRecebimento({
              mensalista: sel, dtPagamento: p.dt_pagamento, valor: p.valor_pago,
              proximo: p.proximo_pagamento, formaDescricao: descricaoForma(formas, p.forma_pagamento),
              operador: perfil.nome, reimpressao: true,
            }));
            setCelularTicket(sel.celular || '');
          }} />
      )}

      {editando && (
        <HeaderModal inicial={editando.novo ? {} : editando} onSalvar={salvar}
          onExcluir={editando.id ? () => excluir(editando.id) : null}
          onFechar={() => setEditando(null)} />
      )}

      {recebendo && (
        <ReceberModal mensalista={recebendo} formas={formas} semCaixa={!caixaAberto}
          onConfirmar={receber} onFechar={() => setRecebendo(null)} />
      )}

      {ticket && (
        <TicketModal ticket={ticket} filial={filial} celular={celularTicket}
          onCelular={setCelularTicket} onFechar={() => setTicket(null)} />
      )}
    </>
  );
}

function rotuloTipoMens(t) {
  return { I: 'Mensalista', P: 'Pacote', H: 'Hóspede' }[t] || t;
}

function vencido(iso) {
  return !!iso && iso < hojeISO();
}

function descricaoForma(formas, codigo) {
  return formas.find((f) => f.codigo === codigo)?.descricao || codigo;
}

function ticketRecebimento({ mensalista, dtPagamento, valor, proximo, formaDescricao, operador, reimpressao }) {
  return {
    titulo: reimpressao ? 'Recibo de mensalidade (reimpressão)' : 'Recibo de mensalidade',
    linhas: [
      ['Mensalista', mensalista.razao],
      ['Data do pagamento', fmtDataBR(dtPagamento)],
      ['Valor pago', fmtBRL(Number(valor))],
      ['Forma de pagamento', formaDescricao],
      ['Próximo pagamento', fmtDataBR(proximo)],
      [reimpressao ? 'Reimpresso por' : 'Operador', operador],
    ],
  };
}

// Recebimento da mensalidade: valor sugerido pelo cadastro, forma de pagamento e
// próximo pagamento calculado (mesmo dia, +1 mês) — editável antes de confirmar.
function ReceberModal({ mensalista, formas, semCaixa, onConfirmar, onFechar }) {
  const hoje = hojeISO();
  // Base do próximo vencimento: a data que está no cadastro (a competência que
  // está sendo paga); sem ela, a data do pagamento.
  const base = mensalista.proximo_pagamento || hoje;
  const [dtPagamento, setDtPagamento] = useState(hoje);
  const [valor, setValor] = useState(String(Number(mensalista.valor_mensalidade || 0)));
  const [forma, setForma] = useState('');
  const [proximo, setProximo] = useState(somarUmMes(base));
  const [observacao, setObservacao] = useState('');

  // Forma padrão = dinheiro (como na saída do pátio).
  useEffect(() => {
    if (!forma && formas.length) setForma(formas.find((f) => f.eh_dinheiro)?.codigo || formas[0].codigo);
    // eslint-disable-next-line
  }, [formas]);

  const semFormas = formas.length === 0;
  const valorInvalido = !(Number(valor) > 0);

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <h2>Receber mensalidade — {mensalista.razao}</h2>
        <p className="suave">
          Vencimento no cadastro: {fmtDataBR(mensalista.proximo_pagamento)}. Ao confirmar, o
          próximo pagamento passa para a data abaixo (mesmo dia do mês seguinte) e o
          comprovante é impresso.
        </p>
        {semCaixa && (
          <p className="aviso">
            Você não tem caixa aberto — este recebimento fica registrado e aparece no
            Painel/BI, mas não entra em nenhum fechamento de caixa.
          </p>
        )}
        <form onSubmit={(e) => { e.preventDefault(); onConfirmar({ mensalista, dtPagamento, valor, forma, proximo, observacao }); }}>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Data do pagamento</label>
            <input type="date" value={dtPagamento} onChange={(e) => setDtPagamento(e.target.value)} required />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Valor pago</label>
            <input type="number" step="0.01" min="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required />
            {Number(mensalista.valor_mensalidade || 0) > 0 && (
              <span className="suave" style={{ fontSize: 11 }}>Mensalidade do cadastro: {fmtBRL(Number(mensalista.valor_mensalidade))}</span>
            )}
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Forma de pagamento</label>
            <select value={forma} onChange={(e) => setForma(e.target.value)} required>
              {formas.map((f) => <option key={f.codigo} value={f.codigo}>{f.descricao}</option>)}
            </select>
            {semFormas && <span className="suave" style={{ fontSize: 11 }}>Nenhuma forma ativa — cadastre em Cadastros → Formas de pagamento.</span>}
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Próximo pagamento</label>
            <input type="date" value={proximo} onChange={(e) => setProximo(e.target.value)} required />
            {vencido(proximo) && (
              <span className="suave" style={{ fontSize: 11 }}>
                Continua vencido — é o pagamento de um mês em atraso; receba os meses seguintes ou ajuste a data.
              </span>
            )}
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Observação (opcional)</label>
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
          {valorInvalido && <p className="aviso">Informe o valor pago.</p>}
          <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={semFormas || valorInvalido}>Confirmar recebimento</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Histórico de recebimentos do mensalista selecionado (com reimpressão do recibo).
function Recebimentos({ mensalista, formas, onReimprimir }) {
  const [pagamentos, setPagamentos] = useState([]);

  useEffect(() => {
    supabase.from('mensalista_pagamentos').select('*')
      .eq('mensalista_id', mensalista.id)
      .order('dt_pagamento', { ascending: false }).order('created_at', { ascending: false })
      .limit(12)
      .then(({ data }) => setPagamentos(data || []));
  }, [mensalista.id, mensalista.proximo_pagamento]);

  return (
    <div className="card">
      <h2>Recebimentos — {mensalista.razao}</h2>
      <table>
        <thead><tr><th>Pagamento</th><th>Valor</th><th>Forma</th><th>Próximo</th><th></th></tr></thead>
        <tbody>
          {pagamentos.map((p) => (
            <tr key={p.id}>
              <td className="mono">{fmtDataBR(p.dt_pagamento)}</td>
              <td>{fmtBRL(Number(p.valor_pago))}</td>
              <td>{descricaoForma(formas, p.forma_pagamento)}</td>
              <td className="mono">{fmtDataBR(p.proximo_pagamento)}</td>
              <td style={{ textAlign: 'right' }}>
                <button className="btn-ghost" onClick={() => onReimprimir(p)}>Reimprimir</button>
              </td>
            </tr>
          ))}
          {pagamentos.length === 0 && <tr><td colSpan={5} className="suave">Nenhum recebimento registrado.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function HeaderModal({ inicial, onSalvar, onExcluir, onFechar }) {
  const [m, setM] = useState(inicial);
  const set = (k, v) => setM((o) => ({ ...o, [k]: v }));
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480, maxHeight: '85vh', overflow: 'auto' }}>
        <h2>{m.id ? 'Editar' : 'Novo'} mensalista</h2>
        <form onSubmit={(e) => { e.preventDefault(); onSalvar(m); }}>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Código *</label>
            <input value={m.codigo || ''} onChange={(e) => set('codigo', e.target.value)} required />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Nome *</label>
            <input value={m.razao || ''} onChange={(e) => set('razao', e.target.value)} required />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Tipo</label>
            <select value={m.tipo_mens || 'I'} onChange={(e) => set('tipo_mens', e.target.value)}>
              <option value="I">Mensalista</option>
              <option value="P">Pacote</option>
              <option value="H">Hóspede</option>
            </select>
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Telefone</label>
            <input value={m.telefone || ''} onChange={(e) => set('telefone', e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Celular</label>
            <input value={m.celular || ''} onChange={(e) => set('celular', e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>E-mail</label>
            <input value={m.email || ''} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Box</label>
            <input value={m.box || ''} onChange={(e) => set('box', e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Valor da mensalidade</label>
            <input type="number" step="0.01" min="0" value={m.valor_mensalidade ?? ''}
              onChange={(e) => set('valor_mensalidade', e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Data do próximo pagamento</label>
            <input type="date" value={m.proximo_pagamento || ''} onChange={(e) => set('proximo_pagamento', e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Dia vencimento</label>
            <input type="number" value={m.dia_venc ?? ''} onChange={(e) => set('dia_venc', e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Tolerância (dias)</label>
            <input type="number" value={m.tolerancia_dias ?? ''} onChange={(e) => set('tolerancia_dias', e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label>Vagas contratadas (veículos simultâneos)</label>
            <input type="number" min="1" value={m.qte_vagas ?? 1} onChange={(e) => set('qte_vagas', e.target.value)} required />
          </div>
          <label className="campo-check" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={m.ativo ?? true} onChange={(e) => set('ativo', e.target.checked)} /> Ativo
          </label>
          <div className="linha-form" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            {onExcluir ? <button type="button" className="btn-ghost aviso-btn" onClick={onExcluir}>Excluir mensalista</button> : <span />}
            <div className="linha-form">
              <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
              <button type="submit" className="btn-primary">Salvar</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Veiculos({ perfil, mensalista }) {
  const [veiculos, setVeiculos] = useState([]);
  const [placa, setPlaca] = useState('');
  const [tipoVeic, setTipoVeic] = useState('');
  const [erro, setErro] = useState('');
  const [confirmPlaca, setConfirmPlaca] = useState(null); // placa fora do formato, aguardando confirmação

  // Busca de modelo no catálogo — mesmo comportamento da Entrada (Pátio).
  const [modelos, setModelos] = useState([]);
  const [buscaModelo, setBuscaModelo] = useState('');
  const [modeloSelecionado, setModeloSelecionado] = useState(null);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);

  const sugestoes = useMemo(() => {
    const alvo = normalizar(buscaModelo);
    if (alvo.length < 2) return [];
    return modelos.filter((m) => normalizar(m.nome).includes(alvo)).slice(0, 8);
  }, [buscaModelo, modelos]);

  useEffect(() => { carregarModelosVeiculo().then(setModelos); }, []);

  async function carregar() {
    const { data } = await supabase.from('mensalista_veiculos')
      .select('*').eq('mensalista_id', mensalista.id).order('placa');
    setVeiculos(data || []);
  }
  useEffect(() => { carregar(); }, [mensalista.id]);

  function onBuscaModeloChange(v) {
    const up = v.toUpperCase();
    setBuscaModelo(up);
    setMostrarSugestoes(true);
    setModeloSelecionado((m) => (m && normalizar(up) !== normalizar(m.nome)) ? null : m);
  }

  function selecionarModelo(m) {
    setModeloSelecionado(m);
    setBuscaModelo(m.nome);
    setMostrarSugestoes(false);
    if (m.tabela_tipo) setTipoVeic(m.tabela_tipo);
  }

  function limparForm() {
    setPlaca(''); setTipoVeic(''); setConfirmPlaca(null);
    setBuscaModelo(''); setModeloSelecionado(null); setMostrarSugestoes(false);
  }

  async function inserirVeiculo(p) {
    setErro('');
    const { error } = await supabase.from('mensalista_veiculos').insert({
      filial_id: perfil.filial_id, mensalista_id: mensalista.id,
      placa: p, modelo: buscaModelo.trim() || null,
      tipo_veic: tipoVeic.trim().toUpperCase() || null,
    });
    if (error) { setErro(error.code === '23505' ? 'Essa placa já está cadastrada (nesta ou noutra filial).' : error.message); setConfirmPlaca(null); return; }
    limparForm();
    carregar();
  }

  async function adicionar(e) {
    e.preventDefault();
    const p = placa.trim().toUpperCase();
    if (!p) return;
    if (!REGEX_PLACA.test(p)) { setConfirmPlaca(p); return; }
    await inserirVeiculo(p);
  }

  async function excluir(id) { await supabase.from('mensalista_veiculos').delete().eq('id', id); carregar(); }

  return (
    <div className="card">
      <h2>Veículos — {mensalista.razao}</h2>
      <p className="suave">
        Contratou {mensalista.qte_vagas} vaga(s) simultânea(s). Se mais veículos do que isso
        estiverem no pátio ao mesmo tempo, os excedentes entram como avulso.
      </p>
      {erro && <div className="aviso">{erro}</div>}
      <table>
        <thead><tr><th>Placa</th><th>Modelo</th><th>Tabela</th><th></th></tr></thead>
        <tbody>
          {veiculos.map((v) => (
            <tr key={v.id}>
              <td className="mono">{v.placa}</td>
              <td>{v.modelo || '—'}</td>
              <td className="mono">{v.tipo_veic || '—'}</td>
              <td style={{ textAlign: 'right' }}><button className="btn-ghost aviso-btn" onClick={() => excluir(v.id)}>Excluir</button></td>
            </tr>
          ))}
          {veiculos.length === 0 && <tr><td colSpan={4} className="suave">Nenhum veículo cadastrado.</td></tr>}
        </tbody>
      </table>
      <form className="linha-form" onSubmit={adicionar} style={{ marginTop: 10 }}>
        <div className="campo">
          <label>Placa</label>
          <input className="mono" style={{ textTransform: 'uppercase', width: 140 }}
            value={placa} onChange={(e) => { setPlaca(e.target.value); setConfirmPlaca(null); }}
            placeholder="ABC1D23" required />
        </div>
        <CapturaPlaca onConfirmar={(p) => { setPlaca(p); setConfirmPlaca(null); }} />
        <div className="campo campo-busca" style={{ minWidth: 200 }}>
          <label>Modelo</label>
          <input value={buscaModelo}
            onChange={(e) => onBuscaModeloChange(e.target.value)}
            onFocus={() => setMostrarSugestoes(true)}
            onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
            placeholder="Digite o modelo…" style={{ width: '100%' }} />
          {mostrarSugestoes && sugestoes.length > 0 && (
            <ul className="sugestoes-lista">
              {sugestoes.map((m) => (
                <li key={m.id} className="sugestao-item"
                  onMouseDown={(e) => { e.preventDefault(); selecionarModelo(m); }}>
                  {m.nome}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="campo">
          <label>Tabela</label>
          <input className="mono" style={{ width: 80, textTransform: 'uppercase' }}
            value={tipoVeic} onChange={(e) => setTipoVeic(e.target.value)} />
        </div>
        <button className="btn-primary" type="submit">+ Veículo</button>
        {modeloSelecionado && <span className="badge-mens">Tabela: {modeloSelecionado.tabela_tipo}</span>}
      </form>

      {confirmPlaca && (
        <div className="modal-bg" onClick={() => setConfirmPlaca(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Confirmar placa</h2>
            <p className="suave">Essa placa não parece ter um formato válido (ex.: ABC1234 ou ABC1D23).</p>
            <div className="grande mono">{confirmPlaca}</div>
            <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => setConfirmPlaca(null)}>Não, corrigir</button>
              <button className="btn-primary" onClick={() => inserirVeiculo(confirmPlaca)}>Sim, está correta</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
