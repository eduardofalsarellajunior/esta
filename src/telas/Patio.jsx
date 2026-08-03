import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { carregarTabelasPreco, carregarPatio, carregarModelosVeiculo, carregarTabelasManuais } from '../lib/dados.js';
import { agoraHHMM, hojeISO, dataDeISO, dataHoraDe, limitesDiaLocal, fmtHora, fmtBRL, dentroDoVencimento } from '../lib/tempo.js';
import { normalizar, REGEX_PLACA } from '../lib/texto.js';
import { calcularTarifa } from '../../packages/tarifacao/tarifacao.ts';
import { TicketModal } from '../componentes/Ticket.jsx';
import CapturaPlaca from '../componentes/CapturaPlaca.jsx';

const MENSALISTA = new Set(['I', 'P', 'H']);
const EXCLUSAO_JANELA_MIN = 5; // operador só pode excluir nos primeiros N minutos da entrada

export default function Patio({ perfil }) {
  const [tabelas, setTabelas] = useState({});
  const [convenios, setConvenios] = useState({});
  const [formas, setFormas] = useState([]);
  const [patio, setPatio] = useState([]);
  const [placa, setPlaca] = useState('');
  const [detectado, setDetectado] = useState(null); // {mensalista, convenio_codigo, tipo_mens}
  const [vagaEsgotada, setVagaEsgotada] = useState(null); // nome do mensalista, se as vagas dele já estão ocupadas
  const [mensalistaVencido, setMensalistaVencido] = useState(null); // nome do mensalista, se venceu (entra como avulso)
  const [erro, setErro] = useState('');
  const [saindo, setSaindo] = useState(null);

  // Busca de modelo de carro (Entrada) + fallback de tabela manual.
  const [modelos, setModelos] = useState([]);
  const [tabelasManuais, setTabelasManuais] = useState([]);
  const [buscaModelo, setBuscaModelo] = useState('');
  const [modeloSelecionado, setModeloSelecionado] = useState(null);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [tabelaManual, setTabelaManual] = useState('');
  const [nomeCarroNovo, setNomeCarroNovo] = useState('');
  const [confirmNovo, setConfirmNovo] = useState(null); // { nome, tipo }
  const [confirmPlaca, setConfirmPlaca] = useState(null); // placa digitada, fora do formato esperado
  const [ticket, setTicket] = useState(null); // { titulo, linhas: [[rotulo, valor], ...] }
  const [celularTicket, setCelularTicket] = useState('');
  const [filial, setFilial] = useState(null); // { nome_fantasia, endereco, cnpj } — cabeçalho do ticket
  const [saidasRecentes, setSaidasRecentes] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [modalServicos, setModalServicos] = useState(null); // { mov, marcados: Set<servico_id> }
  const [movimentosComServico, setMovimentosComServico] = useState(new Set());
  const [modalExclusao, setModalExclusao] = useState(null); // { mov, motivo }
  const [agora, setAgora] = useState(() => Date.now());

  // Tique periódico só pra reavaliar a janela de 5min do botão Excluir (operador).
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const sugestoes = useMemo(() => {
    const alvo = normalizar(buscaModelo);
    if (alvo.length < 2) return [];
    return modelos.filter((m) => normalizar(m.nome).includes(alvo)).slice(0, 8);
  }, [buscaModelo, modelos]);

  const mensalistasNoPatio = useMemo(() => patio.filter((m) => MENSALISTA.has(m.tipo_mens)).length, [patio]);
  const avulsosNoPatio = patio.length - mensalistasNoPatio;

  async function recarregar() {
    try {
      const hoje = hojeISO();
      const { inicio: inicioHoje, fim: fimHoje } = limitesDiaLocal(hoje, hoje);
      const [t, p, cv, fp, md, tm, sr, fl, sv] = await Promise.all([
        carregarTabelasPreco(), carregarPatio(),
        supabase.from('convenios').select('*'),
        supabase.from('formas_pagamento').select('*').eq('ativo', true).order('codigo'),
        carregarModelosVeiculo(), carregarTabelasManuais(),
        // Saídas normais de hoje + veículos excluídos (cancelados) hoje — ordenado/limitado depois em JS.
        supabase.from('movimentos').select('*')
          .or(`dt_saida.eq.${hoje},and(excluido_em.gte.${inicioHoje},excluido_em.lt.${fimHoje})`),
        supabase.from('filiais').select('nome_fantasia, endereco, cnpj').eq('id', perfil.filial_id).maybeSingle(),
        supabase.from('servicos').select('*').eq('ativo', true).order('codigo'),
      ]);
      setTabelas(t); setPatio(p);
      setConvenios(Object.fromEntries((cv.data || []).map((c) => [c.codigo, c])));
      setFormas(fp.data || []);
      setModelos(md); setTabelasManuais(tm);
      const listaSaidas = (sr.data || [])
        .map((m) => ({ ...m, _quando: m.excluido_em ? new Date(m.excluido_em).getTime() : dataHoraDe(m.dt_saida, Number(m.hr_saida)).getTime() }))
        .sort((a, b) => b._quando - a._quando)
        .slice(0, 50);
      setSaidasRecentes(listaSaidas);
      setFilial(fl.data || null);
      setServicos(sv.data || []);
      const idsPatio = p.map((m) => m.id);
      if (idsPatio.length > 0) {
        const { data: ms } = await supabase.from('movimento_servicos').select('movimento_id').in('movimento_id', idsPatio);
        setMovimentosComServico(new Set((ms || []).map((r) => r.movimento_id)));
      } else {
        setMovimentosComServico(new Set());
      }
    } catch (e) { setErro(e.message); }
  }
  useEffect(() => { recarregar(); /* eslint-disable-next-line */ }, []);

  function encontrarNoPatio(p) {
    return patio.find((m) => m.placa === p);
  }

  // Detecção de mensalista ao digitar a placa.
  async function detectar(pl) {
    const p = pl.trim().toUpperCase();
    setDetectado(null);
    setVagaEsgotada(null);
    setMensalistaVencido(null);
    if (p.length < 3) return;

    // Placa já estacionada? Pula direto pra rotina de saída.
    const jaNoPatio = encontrarNoPatio(p);
    if (jaNoPatio) { limparFormEntrada(); prepararSaida(jaNoPatio); return; }

    // Já esteve aqui antes? Traz o modelo de volta pro campo Carro.
    if (!buscaModelo.trim()) {
      const { data: anterior } = await supabase.from('movimentos')
        .select('modelo').eq('placa', p).not('dt_saida', 'is', null)
        .order('dt_saida', { ascending: false }).order('hr_saida', { ascending: false })
        .limit(1).maybeSingle();
      if (anterior?.modelo) {
        const match = modelos.find((m) => normalizar(m.nome) === normalizar(anterior.modelo));
        if (match) selecionarModelo(match);
        else setBuscaModelo(anterior.modelo);
      }
    }

    const { data: mv } = await supabase.from('mensalista_veiculos').select('mensalista_id, modelo, tipo_veic').eq('placa', p).maybeSingle();
    if (!mv) return;
    const { data: m } = await supabase.from('mensalistas').select('*').eq('id', mv.mensalista_id).maybeSingle();
    if (!m || !m.ativo) return;

    // Fora do vencimento + tolerância? Entra como avulso (tabela normal, sem convênio).
    if (!dentroDoVencimento(m.proximo_pagamento, m.tolerancia_dias)) {
      setMensalistaVencido(m.razao);
      if (mv.tipo_veic) await registrarEntrada(mv.tipo_veic, mv.modelo, 'E', null);
      return;
    }

    // Vagas contratadas já ocupadas por OUTROS veículos dele? Entra como avulso.
    const { data: veiculosDele } = await supabase.from('mensalista_veiculos').select('placa').eq('mensalista_id', m.id);
    const outrasPlacas = (veiculosDele || []).map((v) => v.placa).filter((pl) => pl !== p);
    let ocupadas = 0;
    if (outrasPlacas.length) {
      const { count } = await supabase.from('movimentos')
        .select('id', { count: 'exact', head: true }).in('placa', outrasPlacas).is('dt_saida', null).is('excluido_em', null);
      ocupadas = count || 0;
    }
    if (ocupadas >= (m.qte_vagas || 1)) {
      setVagaEsgotada(m.razao);
      return;
    }

    let convCod = null;
    if (m.convenio_id) {
      const { data: c } = await supabase.from('convenios').select('codigo').eq('id', m.convenio_id).maybeSingle();
      convCod = c?.codigo ?? null;
    }

    // Veículo já cadastrado com tabela definida: completa a entrada sozinho.
    if (mv.tipo_veic) {
      await registrarEntrada(mv.tipo_veic, mv.modelo, m.tipo_mens, convCod);
      return;
    }

    setDetectado({ nome: m.razao, tipo_mens: m.tipo_mens, convenio_codigo: convCod });
  }

  function onBuscaModeloChange(valorDigitado) {
    const v = valorDigitado.toUpperCase();
    setBuscaModelo(v);
    setMostrarSugestoes(true);
    setModeloSelecionado((m) => (m && normalizar(v) !== normalizar(m.nome)) ? null : m);
  }

  function selecionarModelo(m) {
    setModeloSelecionado(m);
    setBuscaModelo(m.nome);
    setMostrarSugestoes(false);
    setTabelaManual(''); setNomeCarroNovo('');
  }

  // Pré-preenche o nome do carro novo com o que foi digitado, enquanto nada foi
  // selecionado do catálogo (o operador ainda pode editar antes de confirmar).
  useEffect(() => {
    if (!modeloSelecionado) setNomeCarroNovo(buscaModelo);
    // eslint-disable-next-line
  }, [buscaModelo]);

  function limparFormEntrada() {
    setPlaca(''); setDetectado(null); setVagaEsgotada(null); setMensalistaVencido(null);
    setBuscaModelo(''); setModeloSelecionado(null); setMostrarSugestoes(false);
    setTabelaManual(''); setNomeCarroNovo(''); setConfirmNovo(null);
  }

  async function registrarEntrada(tipoVeic, nomeModelo, tipoMens, convenioCodigo) {
    const p = placa.trim().toUpperCase();
    const dtEntrada = hojeISO();
    const hrEntrada = agoraHHMM();
    const { error } = await supabase.from('movimentos').insert({
      filial_id: perfil.filial_id, placa: p, modelo: nomeModelo || null,
      dt_entrada: dtEntrada, hr_entrada: hrEntrada,
      tipo_veic: tipoVeic,
      tipo_mens: tipoMens ?? detectado?.tipo_mens ?? 'E',
      convenio_codigo: convenioCodigo ?? detectado?.convenio_codigo ?? null,
      usuario_entrada: perfil.id,
    });
    if (error) { setErro(error.code === '23505' ? 'Essa placa já está no pátio.' : error.message); return; }
    setTicket({
      titulo: 'Ticket de entrada',
      linhas: [
        ['Placa', p],
        ['Carro', nomeModelo || '—'],
        ['Tabela', tipoVeic],
        ['Entrada', `${dtEntrada.split('-').reverse().join('/')} ${fmtHora(Number(hrEntrada))}`],
        ['Operador', perfil.nome],
      ],
    });
    setCelularTicket('');
    limparFormEntrada();
    recarregar();
  }

  async function darEntrada(e) {
    e.preventDefault();
    setErro('');
    const p = placa.trim().toUpperCase();
    if (!p) return;

    // Segurança extra (ex.: Enter sem sair do campo, sem disparar o onBlur).
    const jaNoPatio = encontrarNoPatio(p);
    if (jaNoPatio) { limparFormEntrada(); prepararSaida(jaNoPatio); return; }

    if (!REGEX_PLACA.test(p)) { setConfirmPlaca(p); return; }
    await prosseguirEntrada();
  }

  async function prosseguirEntrada() {
    if (modeloSelecionado) {
      await registrarEntrada(modeloSelecionado.tabela_tipo, modeloSelecionado.nome);
      return;
    }
    // Digitou o nome certinho mas não clicou na sugestão — casa mesmo assim.
    const alvo = normalizar(buscaModelo);
    const matchExato = alvo && modelos.find((m) => normalizar(m.nome) === alvo);
    if (matchExato) {
      await registrarEntrada(matchExato.tabela_tipo, matchExato.nome);
      return;
    }
    if (tabelaManual && nomeCarroNovo.trim()) {
      setConfirmNovo({ nome: nomeCarroNovo.trim(), tipo: tabelaManual });
      return;
    }
    setErro('Digite um carro do catálogo, ou selecione a tabela manual e o nome do carro novo.');
  }

  async function confirmarPlacaForcada() {
    setConfirmPlaca(null);
    await prosseguirEntrada();
  }

  function corrigirPlaca() {
    setConfirmPlaca(null);
    setPlaca('');
    setDetectado(null);
  }

  async function confirmarNovoCarro() {
    if (!confirmNovo) return;
    const { nome, tipo } = confirmNovo;
    const codigo = `AUTO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data: novo, error } = await supabase.from('modelos_veiculo')
      .insert({ filial_id: perfil.filial_id, codigo, nome, tabela_tipo: tipo, ativo: true })
      .select().single();
    if (error) { setErro(error.message); setConfirmNovo(null); return; }
    setModelos((ms) => [...ms, novo]);
    setConfirmNovo(null);
    await registrarEntrada(tipo, nome);
  }

  async function abrirServicosModal(mov) {
    const { data } = await supabase.from('movimento_servicos').select('servico_id').eq('movimento_id', mov.id);
    setModalServicos({ mov, marcados: new Set((data || []).map((r) => r.servico_id)) });
  }

  async function alternarServico(servicoId) {
    if (!modalServicos) return;
    const { mov, marcados } = modalServicos;
    const jaMarcado = marcados.has(servicoId);
    const acao = jaMarcado
      ? supabase.from('movimento_servicos').delete().eq('movimento_id', mov.id).eq('servico_id', servicoId)
      : supabase.from('movimento_servicos').insert({ filial_id: perfil.filial_id, movimento_id: mov.id, servico_id: servicoId });
    const { error } = await acao;
    if (error) { setErro(error.message); return; }
    const novosMarcados = new Set(marcados);
    if (jaMarcado) novosMarcados.delete(servicoId); else novosMarcados.add(servicoId);
    setModalServicos({ mov, marcados: novosMarcados });
    setMovimentosComServico((prev) => {
      const proximo = new Set(prev);
      if (novosMarcados.size > 0) proximo.add(mov.id); else proximo.delete(mov.id);
      return proximo;
    });
  }

  async function buscarServicosDoMovimento(movimentoId) {
    const { data } = await supabase.from('movimento_servicos').select('servico_id').eq('movimento_id', movimentoId);
    const ids = new Set((data || []).map((r) => r.servico_id));
    return servicos.filter((s) => ids.has(s.id));
  }

  // Operador só exclui nos primeiros 5min da entrada; supervisor sem limite.
  function podeExcluir(mov) {
    if (perfil.papel === 'supervisor') return true;
    const minutos = (agora - dataHoraDe(mov.dt_entrada, Number(mov.hr_entrada)).getTime()) / 60000;
    return minutos <= EXCLUSAO_JANELA_MIN;
  }

  function abrirExclusao(mov) {
    setModalExclusao({ mov, motivo: '' });
  }

  async function confirmarExclusao() {
    if (!modalExclusao) return;
    const { mov, motivo } = modalExclusao;
    if (!motivo.trim()) { setErro('Informe o motivo da exclusão.'); return; }
    if (!podeExcluir(mov)) {
      setErro(`Prazo de ${EXCLUSAO_JANELA_MIN} minutos para excluir expirou — peça a um supervisor.`);
      setModalExclusao(null);
      return;
    }
    const agoraDt = new Date();
    const { error } = await supabase.from('movimentos').update({
      excluido_em: agoraDt.toISOString(), excluido_motivo: motivo.trim(), excluido_por: perfil.id,
    }).eq('id', mov.id);
    if (error) { setErro(error.message); return; }
    const dataExclusao = `${String(agoraDt.getDate()).padStart(2, '0')}/${String(agoraDt.getMonth() + 1).padStart(2, '0')}/${agoraDt.getFullYear()}`;
    const horaExclusao = `${String(agoraDt.getHours()).padStart(2, '0')}:${String(agoraDt.getMinutes()).padStart(2, '0')}`;
    setTicket({
      titulo: 'Exclusão de veículo',
      linhas: [
        ['Placa', mov.placa],
        ['Modelo', mov.modelo || '—'],
        ['Entrada', `${mov.dt_entrada.split('-').reverse().join('/')} ${fmtHora(Number(mov.hr_entrada))}`],
        ['Exclusão', `${dataExclusao} ${horaExclusao}`],
        ['Motivo', motivo.trim()],
      ],
    });
    setCelularTicket('');
    setModalExclusao(null);
    recarregar();
  }

  function reimprimirExclusao(mov) {
    const dt = new Date(mov.excluido_em);
    const dataExclusao = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
    const horaExclusao = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    setTicket({
      titulo: 'Exclusão de veículo (reimpressão)',
      linhas: [
        ['Placa', mov.placa],
        ['Modelo', mov.modelo || '—'],
        ['Entrada', `${mov.dt_entrada.split('-').reverse().join('/')} ${fmtHora(Number(mov.hr_entrada))}`],
        ['Exclusão', `${dataExclusao} ${horaExclusao}`],
        ['Motivo', mov.excluido_motivo || '—'],
      ],
    });
    setCelularTicket('');
  }

  function calcularResultadoSaida(mov, convenioCodigo, servicosTipos) {
    if (MENSALISTA.has(mov.tipo_mens)) {
      // Mensalista: já paga a mensalidade; saída sem cobrança nesta fase.
      return { valor: 0, valorProporcional: 0, valorConvenio: 0, pontos: 0, mensalista: true, tempoDecorrido: 0 };
    }
    const convenio = convenioCodigo ? mapConvenio(convenios[convenioCodigo]) : undefined;
    return calcularTarifa({
      tabelas, tipoVeic: mov.tipo_veic, convenio,
      servicosTipos: servicosTipos && servicosTipos.length ? servicosTipos : undefined,
      movimento: { dtEntrada: dataDeISO(mov.dt_entrada), entrada: Number(mov.hr_entrada), dtSaida: new Date(), saida: agoraHHMM() },
    });
  }

  async function prepararSaida(mov) {
    try {
      const servicosSelecionados = await buscarServicosDoMovimento(mov.id);
      const servicosTipos = servicosSelecionados.map((s) => s.tabela_tipo);
      const convenioCodigo = mov.convenio_codigo || '';
      const resultado = calcularResultadoSaida(mov, convenioCodigo, servicosTipos);
      const formaPadrao = formas.find((f) => f.eh_dinheiro)?.codigo || formas[0]?.codigo || 'D';
      setSaindo({ mov, convenioCodigo, servicosTipos, servicosSelecionados, resultado, pagamentos: [{ forma: formaPadrao, valor: resultado.valor }] });
    } catch (e) { setErro(e.message); }
  }

  function mudarConvenioSaida(codigo) {
    if (!saindo) return;
    try {
      const resultado = calcularResultadoSaida(saindo.mov, codigo, saindo.servicosTipos);
      const formaAtual = saindo.pagamentos[0]?.forma || formas.find((f) => f.eh_dinheiro)?.codigo || formas[0]?.codigo || 'D';
      setSaindo({ ...saindo, convenioCodigo: codigo, resultado, pagamentos: [{ forma: formaAtual, valor: resultado.valor }] });
    } catch (e) { setErro(e.message); }
  }

  async function confirmarSaida() {
    const { mov, resultado, pagamentos, convenioCodigo } = saindo;
    const dtSaida = hojeISO();
    const hrSaida = agoraHHMM();
    // Liga ao caixa aberto do operador (se houver), para o fechamento.
    const { data: cx } = await supabase.from('caixas').select('id')
      .eq('operador_id', perfil.id).eq('status', 'aberto').maybeSingle();
    const { error } = await supabase.from('movimentos').update({
      dt_saida: dtSaida, hr_saida: hrSaida,
      convenio_codigo: convenioCodigo || null,
      valor: resultado.valor, valor_proporcional: resultado.valorProporcional,
      valor_convenio: resultado.valorConvenio, pontos_ganhos: resultado.pontos,
      caixa_id: cx?.id ?? null, usuario_saida: perfil.id,
    }).eq('id', mov.id);
    if (error) { setErro(error.message); return; }

    // Rateio de pagamento.
    const pagos = pagamentos.filter((p) => Number(p.valor) > 0);
    const linhasPag = pagos.map((p) => ({ filial_id: perfil.filial_id, movimento_id: mov.id, forma_pagamento: p.forma, valor: Number(p.valor) }));
    if (linhasPag.length) await supabase.from('movimento_pagamentos').insert(linhasPag);

    // Fidelidade (best-effort).
    if (!resultado.mensalista) await atualizarFidelidade(mov.placa, resultado.pontos);

    const formaTexto = resultado.mensalista ? 'Mensalista/hóspede'
      : (pagos.map((p) => formas.find((f) => f.codigo === p.forma)?.descricao || p.forma).join(' + ') || '—');
    const { servicosSelecionados } = saindo;
    setTicket({
      titulo: 'Ticket de saída',
      linhas: [
        ['Placa', mov.placa],
        ['Carro', mov.modelo || '—'],
        ['Entrada', `${mov.dt_entrada.split('-').reverse().join('/')} ${fmtHora(Number(mov.hr_entrada))}`],
        ['Tempo', resultado.mensalista ? '—' : fmtHora(resultado.tempoDecorrido)],
        ...(servicosSelecionados?.length ? [['Serviços', servicosSelecionados.map((s) => s.descricao).join(', ')]] : []),
        ...(convenioCodigo && resultado.valorConvenio > 0
          ? [['Convênio', convenioCodigo], ['Valor convênio', `-${fmtBRL(resultado.valorConvenio)}`]]
          : []),
        ['Valor', fmtBRL(resultado.valor)],
        ['Pagamento', formaTexto],
        ['Saída', `${dtSaida.split('-').reverse().join('/')} ${fmtHora(Number(hrSaida))}`],
        ['Operador', perfil.nome],
      ],
    });
    setCelularTicket('');
    setSaindo(null); recarregar();
  }

  async function reimprimirSaida(mov) {
    const { data: pagtos } = await supabase.from('movimento_pagamentos')
      .select('forma_pagamento, valor').eq('movimento_id', mov.id);
    const formaTexto = pagtos && pagtos.length
      ? pagtos.map((p) => formas.find((f) => f.codigo === p.forma_pagamento)?.descricao || p.forma_pagamento).join(' + ')
      : (MENSALISTA.has(mov.tipo_mens) ? 'Mensalista/hóspede' : '—');
    const valorConvenio = Number(mov.valor_convenio || 0);
    const servicosDoMov = await buscarServicosDoMovimento(mov.id);
    setTicket({
      titulo: 'Ticket de saída (reimpressão)',
      linhas: [
        ['Placa', mov.placa],
        ['Carro', mov.modelo || '—'],
        ['Entrada', `${mov.dt_entrada.split('-').reverse().join('/')} ${fmtHora(Number(mov.hr_entrada))}`],
        ...(servicosDoMov.length ? [['Serviços', servicosDoMov.map((s) => s.descricao).join(', ')]] : []),
        ...(mov.convenio_codigo && valorConvenio > 0
          ? [['Convênio', mov.convenio_codigo], ['Valor convênio', `-${fmtBRL(valorConvenio)}`]]
          : []),
        ['Valor', fmtBRL(Number(mov.valor || 0))],
        ['Pagamento', formaTexto],
        ['Saída', `${mov.dt_saida.split('-').reverse().join('/')} ${fmtHora(Number(mov.hr_saida))}`],
        ['Reimpresso por', perfil.nome],
      ],
    });
    setCelularTicket('');
  }

  async function atualizarFidelidade(placa, pontos) {
    try {
      const { data: c } = await supabase.from('clientes').select('*').eq('placa', placa).maybeSingle();
      if (c) {
        await supabase.from('clientes').update({
          qte_visitas: (c.qte_visitas || 0) + 1, qte_pontos: Number(c.qte_pontos || 0) + Number(pontos || 0), ult_visita: hojeISO(),
        }).eq('id', c.id);
      } else {
        await supabase.from('clientes').insert({
          filial_id: perfil.filial_id, placa, qte_visitas: 1, qte_pontos: Number(pontos || 0), ult_visita: hojeISO(),
        });
      }
    } catch { /* fidelidade é best-effort */ }
  }

  const totalPago = (saindo?.pagamentos || []).reduce((s, p) => s + Number(p.valor || 0), 0);

  return (
    <>
      {erro && <div className="card aviso">{erro}</div>}

      <div className="card">
        <h2>Entrada de veículo</h2>
        <form className="linha-form" onSubmit={darEntrada}>
          <div className="campo">
            <label>Placa</label>
            <input className="mono" value={placa}
              onChange={(e) => { setPlaca(e.target.value); setConfirmPlaca(null); setVagaEsgotada(null); setMensalistaVencido(null); }}
              onBlur={(e) => detectar(e.target.value)}
              placeholder="ABC1D23" style={{ textTransform: 'uppercase', width: 140 }} />
          </div>
          <CapturaPlaca onConfirmar={(p) => { setPlaca(p); setConfirmPlaca(null); setVagaEsgotada(null); setMensalistaVencido(null); detectar(p); }} />
          <div className="campo campo-busca" style={{ minWidth: 220 }}>
            <label>Carro</label>
            <input value={buscaModelo}
              onChange={(e) => onBuscaModeloChange(e.target.value)}
              onFocus={() => setMostrarSugestoes(true)}
              onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
              placeholder="Digite o modelo do carro…" style={{ width: '100%' }} />
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
          {modeloSelecionado && <span className="badge-mens">Tabela: {modeloSelecionado.tabela_tipo}</span>}
          {buscaModelo.trim().length >= 2 && !modeloSelecionado && sugestoes.length === 0 && (
            <>
              <div className="campo">
                <label>Tabela de preço (carro não encontrado)</label>
                <select value={tabelaManual} onChange={(e) => setTabelaManual(e.target.value)}>
                  <option value="">—</option>
                  {tabelasManuais.map((t) => <option key={t.tipo} value={t.tipo}>{t.tipo} · {t.descricao}</option>)}
                </select>
                {tabelasManuais.length === 0 && <span className="suave" style={{ fontSize: 11 }}>Nenhuma tabela liberada — marque em Preços.</span>}
              </div>
              <div className="campo">
                <label>Nome do carro (novo)</label>
                <input value={nomeCarroNovo} onChange={(e) => setNomeCarroNovo(e.target.value.toUpperCase())} />
              </div>
            </>
          )}
          <button className="btn-primary" type="submit">Registrar entrada</button>
          {detectado && (
            <span className="badge-mens">
              {detectado.tipo_mens === 'H' ? 'Hóspede' : 'Mensalista'}: {detectado.nome}
              {detectado.convenio_codigo && ` · conv. ${detectado.convenio_codigo}`}
            </span>
          )}
          {vagaEsgotada && (
            <span className="badge-mens" style={{ color: 'var(--ambar)', borderColor: 'var(--ambar)', background: 'rgba(245,166,35,.12)' }}>
              Vaga(s) de {vagaEsgotada} já ocupada(s) — entrando como avulso
            </span>
          )}
          {mensalistaVencido && (
            <span className="badge-mens" style={{ color: 'var(--ambar)', borderColor: 'var(--ambar)', background: 'rgba(245,166,35,.12)' }}>
              Mensalidade de {mensalistaVencido} vencida — entrando como avulso
            </span>
          )}
        </form>
      </div>

      <div className="card">
        <h2>No pátio ({patio.length}) — {avulsosNoPatio} avulso(s), {mensalistasNoPatio} mensalista(s)</h2>
        <div className="tabela-scroll">
          <table>
            <thead><tr><th>Placa</th><th>Carro</th><th>Tabela</th><th>Tipo</th><th>Entrada</th><th></th></tr></thead>
            <tbody>
              {patio.map((m) => (
                <tr key={m.id}>
                  <td><span className="placa mono">{m.placa}</span></td>
                  <td>{m.modelo || '—'}</td>
                  <td>{m.tipo_veic}</td>
                  <td>{rotuloTipo(m.tipo_mens)}{m.convenio_codigo ? ` · ${m.convenio_codigo}` : ''}</td>
                  <td className="mono">{m.dt_entrada.split('-').reverse().join('/')} {fmtHora(Number(m.hr_entrada))}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {podeExcluir(m) && (
                      <button className="btn-ghost aviso-btn" onClick={() => abrirExclusao(m)}>Excluir</button>
                    )}
                    <button
                      className={movimentosComServico.has(m.id) ? 'btn-servico-ativo' : 'btn-ghost'}
                      onClick={() => abrirServicosModal(m)}
                    >Serviço</button>
                    <button className="btn-primary" onClick={() => prepararSaida(m)}>Saída</button>
                  </td>
                </tr>
              ))}
              {patio.length === 0 && <tr><td colSpan={6} className="suave">Pátio vazio.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Saídas de hoje ({saidasRecentes.length})</h2>
        <div className="tabela-scroll">
          <table>
            <thead><tr><th>Placa</th><th>Carro</th><th>Saída</th><th>Valor</th><th></th></tr></thead>
            <tbody>
              {saidasRecentes.map((m) => (
                <tr key={m.id}>
                  <td><span className="placa mono">{m.placa}</span></td>
                  <td>{m.modelo || '—'}</td>
                  <td className="mono">
                    {m.excluido_em
                      ? new Date(m.excluido_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                      : fmtHora(Number(m.hr_saida))}
                  </td>
                  <td>{m.excluido_em ? <span className="status status-cancelada">Cancelado</span> : fmtBRL(Number(m.valor || 0))}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-ghost" onClick={() => (m.excluido_em ? reimprimirExclusao(m) : reimprimirSaida(m))}>Reimprimir</button>
                  </td>
                </tr>
              ))}
              {saidasRecentes.length === 0 && <tr><td colSpan={5} className="suave">Nenhuma saída hoje.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modalServicos && (
        <div className="modal-bg" onClick={() => setModalServicos(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Serviços — <span className="placa mono">{modalServicos.mov.placa}</span></h2>
            <p className="suave">
              Marque os serviços feitos neste veículo. Na saída, se houver algum marcado, o valor
              cobrado vira a soma das tabelas desses serviços, em vez da tabela do veículo.
            </p>
            {servicos.length === 0 && <p className="suave">Nenhum serviço cadastrado — cadastre em Cadastros → Serviços.</p>}
            {servicos.map((s) => (
              <label className="campo-check" key={s.id} style={{ marginBottom: 8 }}>
                <input type="checkbox" checked={modalServicos.marcados.has(s.id)}
                  onChange={() => alternarServico(s.id)} />
                {s.codigo} · {s.descricao}
              </label>
            ))}
            <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-primary" onClick={() => setModalServicos(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {modalExclusao && (
        <div className="modal-bg" onClick={() => setModalExclusao(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Excluir veículo — <span className="placa mono">{modalExclusao.mov.placa}</span></h2>
            <p className="suave">
              Cancela a entrada deste veículo (some do pátio, sem cobrança). Fica registrado
              para auditoria com data/hora e o motivo abaixo, e imprime um comprovante.
            </p>
            <div className="campo">
              <label>Motivo da exclusão</label>
              <textarea rows={3} style={{ width: '100%' }} value={modalExclusao.motivo}
                onChange={(e) => setModalExclusao({ ...modalExclusao, motivo: e.target.value })} />
            </div>
            <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => setModalExclusao(null)}>Cancelar</button>
              <button className="btn-primary" onClick={confirmarExclusao}>Confirmar exclusão</button>
            </div>
          </div>
        </div>
      )}

      {confirmPlaca && (
        <div className="modal-bg" onClick={corrigirPlaca}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Confirmar placa</h2>
            <p className="suave">Essa placa não parece ter um formato válido (ex.: ABC1234 ou ABC1D23).</p>
            <div className="grande mono">{confirmPlaca}</div>
            <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-ghost" onClick={corrigirPlaca}>Não, digitar outra</button>
              <button className="btn-primary" onClick={confirmarPlacaForcada}>Sim, está correta</button>
            </div>
          </div>
        </div>
      )}

      {confirmNovo && (
        <div className="modal-bg" onClick={() => setConfirmNovo(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Confirmar carro novo</h2>
            <p className="suave">Confira se o nome está certo — ele entra no catálogo de modelos permanentemente.</p>
            <div className="grande">{confirmNovo.nome}</div>
            <p className="mono suave" style={{ textAlign: 'center' }}>Tabela: {confirmNovo.tipo}</p>
            <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => setConfirmNovo(null)}>Cancelar</button>
              <button className="btn-primary" onClick={confirmarNovoCarro}>Confirmar e adicionar</button>
            </div>
          </div>
        </div>
      )}

      {ticket && (
        <TicketModal ticket={ticket} filial={filial} celular={celularTicket}
          onCelular={setCelularTicket} onFechar={() => setTicket(null)} />
      )}

      {saindo && (
        <div className="modal-bg" onClick={() => setSaindo(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Saída — <span className="placa mono">{saindo.mov.placa}</span></h2>
            {!saindo.resultado.mensalista && (
              <div className="campo" style={{ marginBottom: 10 }}>
                <label>Convênio (opcional — em branco cobra normal)</label>
                <select value={saindo.convenioCodigo} onChange={(e) => mudarConvenioSaida(e.target.value)}>
                  <option value="">— Sem convênio —</option>
                  {Object.values(convenios)
                    .filter((c) => c.ativo && (!c.so_supervisor || perfil.papel === 'supervisor'))
                    .map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.razao}</option>)}
                </select>
              </div>
            )}
            {saindo.resultado.mensalista ? (
              <p className="suave">Mensalista/hóspede — sem cobrança na saída (mensalidade paga à parte).</p>
            ) : (
              <p className="mono suave">
                Tempo: {fmtHora(saindo.resultado.tempoDecorrido)}
                {saindo.resultado.valorConvenio > 0 && ` · conv. -${fmtBRL(saindo.resultado.valorConvenio)}`}
              </p>
            )}
            {saindo.servicosSelecionados?.length > 0 && (
              <p className="suave">
                Cobrando por serviço: {saindo.servicosSelecionados.map((s) => s.descricao).join(', ')}
                {' '}(em vez da tabela do veículo)
              </p>
            )}
            <div className="grande">{fmtBRL(saindo.resultado.valor)}</div>

            {!saindo.resultado.mensalista && saindo.resultado.valor > 0 && (
              <div style={{ margin: '12px 0' }}>
                <label className="suave">Pagamento</label>
                {saindo.pagamentos.map((p, i) => (
                  <div className="linha-form" key={i} style={{ marginTop: 6 }}>
                    <select value={p.forma} onChange={(e) => atualizaPagto(i, 'forma', e.target.value)}>
                      {formas.map((f) => <option key={f.codigo} value={f.codigo}>{f.descricao}</option>)}
                    </select>
                    <input type="number" step="0.01" value={p.valor}
                      onChange={(e) => atualizaPagto(i, 'valor', e.target.value)} style={{ width: 120 }} />
                    {saindo.pagamentos.length > 1 && <button className="btn-ghost" onClick={() => removePagto(i)}>×</button>}
                  </div>
                ))}
                <button className="btn-ghost" onClick={addPagto} style={{ marginTop: 6 }}>+ dividir pagamento</button>
                {Math.abs(totalPago - saindo.resultado.valor) > 0.005 && (
                  <p className="aviso">Soma dos pagamentos ({fmtBRL(totalPago)}) difere do valor.</p>
                )}
              </div>
            )}

            {saindo.resultado.manual && <p className="aviso">Tempo fora das faixas — confira o valor.</p>}
            <div className="linha-form" style={{ justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setSaindo(null)}>Cancelar</button>
              <button className="btn-primary" onClick={confirmarSaida}>Confirmar saída</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  function atualizaPagto(i, campo, valor) {
    setSaindo((s) => { const pg = s.pagamentos.map((p, j) => j === i ? { ...p, [campo]: valor } : p); return { ...s, pagamentos: pg }; });
  }
  function addPagto() {
    setSaindo((s) => ({ ...s, pagamentos: [...s.pagamentos, { forma: formas[0]?.codigo || 'D', valor: 0 }] }));
  }
  function removePagto(i) {
    setSaindo((s) => ({ ...s, pagamentos: s.pagamentos.filter((_, j) => j !== i) }));
  }
}

function rotuloTipo(t) {
  return { E: 'Avulso', I: 'Mensalista', P: 'Pacote', H: 'Hóspede', C: 'Convênio' }[t] || t;
}

function mapConvenio(c) {
  if (!c) return undefined;
  return {
    codigo: c.codigo, tabConv: c.tab_conv || undefined, tabHoras: c.tab_horas,
    perConv: Number(c.perc_conv || 0), vlrConv: Number(c.vlr_conv || 0),
  };
}
