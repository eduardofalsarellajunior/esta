import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { carregarTabelasPreco, carregarPatio, carregarModelosVeiculo, carregarTabelasManuais, carregarModelosTicket } from '../lib/dados.js';
import { agoraHHMM, hojeISO, dataDeISO, dataHoraDe, limitesDiaLocal, fmtHora, fmtBRL, dentroDoVencimento } from '../lib/tempo.js';
import { normalizar, REGEX_PLACA } from '../lib/texto.js';
import { calcularTarifa, horas as horasDecorridas } from '../../packages/tarifacao/tarifacao.ts';
import { diaSemanaLegado, calcularRestricaoEntrada } from '../lib/restricaoMensalista.js';
import { TicketModal } from '../componentes/Ticket.jsx';
import CapturaPlaca from '../componentes/CapturaPlaca.jsx';
import CardAcoes from '../componentes/CardAcoes.jsx';
import ReceberMensalidadeFluxo from '../componentes/ReceberMensalidade.jsx';
import { criarNotaFiscal } from '../lib/notaFiscal.js';
import { dadosFilial, dadosMovimento, permanenciaDe, montarTicketRps } from '../lib/dadosTicket.js';
import { erroCpfCnpj, validarCpfCnpj, formatarCpfCnpj } from '../lib/documento.js';
import { ehGerente } from '../lib/acesso.js';

const MENSALISTA = new Set(['I', 'P', 'H']);
const EXCLUSAO_JANELA_MIN = 5; // operador só pode excluir nos primeiros N minutos da entrada

/** Placa fictícia de quem entrou sem placa — convenção herdada do legado. */
const semChapa = (placa) => String(placa || '').startsWith('$$$');
const placaSemChapa = (controle) => `$$$${String(controle).padStart(4, '0')}`;
/** Na tela, `$$$0042` só polui: o nº já está na coluna ao lado. */
const rotuloPlaca = (placa) => (semChapa(placa) ? 'sem placa' : placa);

export default function Patio({ perfil }) {
  const [tabelas, setTabelas] = useState({});
  const [convenios, setConvenios] = useState({});
  const [formas, setFormas] = useState([]);
  const [patio, setPatio] = useState([]);
  const [placa, setPlaca] = useState('');
  const [detectado, setDetectado] = useState(null); // {mensalista, convenio_codigo, tipo_mens}
  const [vagaEsgotada, setVagaEsgotada] = useState(null); // nome do mensalista, se as vagas dele já estão ocupadas
  const [mensalistaVencido, setMensalistaVencido] = useState(null); // nome do mensalista, se venceu (entra como avulso)
  const [restricaoHorario, setRestricaoHorario] = useState(null); // { nome, livreAPartir } — fora do dia/turno contratado
  const [livreAPartirEntrada, setLivreAPartirEntrada] = useState(null); // valor a persistir na entrada (ver registrarEntrada)
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
  const [placaTicket, setPlacaTicket] = useState(''); // placa do ticket atual — pra TicketModal saber onde salvar o celular
  const [filial, setFilial] = useState(null); // dados do estabelecimento — cabeçalho/tokens do ticket
  const [modelosTicket, setModelosTicket] = useState({}); // tipo -> layout com tokens (vazio = layout fixo)
  const [saidasRecentes, setSaidasRecentes] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [modalServicos, setModalServicos] = useState(null); // { mov, marcados: Set<servico_id> }
  const [movimentosComServico, setMovimentosComServico] = useState(new Set());
  const [modalValorServico, setModalValorServico] = useState(null); // { servicoId, descricao, valor } — serviço "Pede valor" (ver alternarServico)
  const [modalExclusao, setModalExclusao] = useState(null); // { mov, motivo }
  const [modalDps, setModalDps] = useState(null); // { documento, nome }
  const [modalValor, setModalValor] = useState(null); // { valor } — alteração manual do valor da saída
  const [agora, setAgora] = useState(() => Date.now());
  const [abrirRecebimento, setAbrirRecebimento] = useState(false); // fluxo de "Receber mensalidade" (menu ⋮)
  const [modalSenhaMes, setModalSenhaMes] = useState(null); // { senha, erro, ocupado } — "Cadastrar senha do mês" (menu ⋮)
  const [caixaAberto, setCaixaAberto] = useState(null);
  const placaRef = useRef(null);
  // Ausente = true (comportamento de sempre): só desliga se explicitamente false.
  const imprimeTicketMensalista = filial?.config?.patio?.imprimeTicketMensalista !== false;

  /**
   * Volta o cursor pro campo de placa — na cabine o operador encadeia um carro
   * atrás do outro e não deveria precisar do mouse. Chamado ao abrir a tela e
   * ao fechar o comprovante (não logo depois da entrada/saída: enquanto o
   * ticket está aberto o foco pertence a ele, inclusive pros atalhos F/W/I).
   */
  function focarPlaca() {
    placaRef.current?.focus();
  }
  useEffect(() => { focarPlaca(); }, []);

  useEffect(() => {
    supabase.from('caixas').select('id').eq('operador_id', perfil.id).eq('status', 'aberto').maybeSingle()
      .then(({ data }) => setCaixaAberto(data));
  }, [perfil.id]);

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
      const [t, p, cv, fp, md, tm, sr, fl, sv, mt] = await Promise.all([
        carregarTabelasPreco(), carregarPatio(),
        supabase.from('convenios').select('*'),
        supabase.from('formas_pagamento').select('*').eq('ativo', true).order('codigo'),
        carregarModelosVeiculo(), carregarTabelasManuais(),
        // Saídas normais de hoje + veículos excluídos (cancelados) hoje — ordenado/limitado depois em JS.
        supabase.from('movimentos').select('*')
          .or(`dt_saida.eq.${hoje},and(excluido_em.gte.${inicioHoje},excluido_em.lt.${fimHoje})`),
        supabase.from('filiais').select('*').eq('id', perfil.filial_id).maybeSingle(),
        supabase.from('servicos').select('*').eq('ativo', true).order('codigo'),
        carregarModelosTicket(),
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
      setModelosTicket(mt);
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

  /**
   * Aplica o layout que a filial cadastrou (tabela `modelos_ticket`) ao ticket.
   * Sem modelo pro tipo, o layout na tela/impressão/WhatsApp continua sendo o
   * fixo de sempre (`ticket.modelo` fica ausente) — mas `tipo`+`dados` são
   * anexados de qualquer forma: é o que permite Imprimir Bluetooth/na cabine
   * (que usam o modelo padrão de fábrica como último recurso, ver escpos.js).
   */
  function comModelo(tipo, ticket, dados) {
    const modelo = modelosTicket[tipo];
    return {
      ...ticket, tipo,
      ...(modelo ? { modelo } : {}),
      dados: { ...dadosFilial(filial || {}), ...dados },
    };
  }

  /**
   * Acha o carro no pátio pelo que o operador digitou no campo da placa: o
   * número de controle (só dígitos) ou a placa. Não há ambiguidade porque
   * placa brasileira sempre tem letra.
   */
  function encontrarNoPatio(texto) {
    const p = String(texto || '').trim().toUpperCase();
    if (!p) return null;
    if (/^\d{1,4}$/.test(p)) {
      const porControle = patio.find((m) => m.controle === Number(p));
      if (porControle) return porControle;
    }
    return patio.find((m) => m.placa === p) || null;
  }

  // Detecção de mensalista ao digitar a placa.
  async function detectar(pl) {
    const p = pl.trim().toUpperCase();
    setDetectado(null);
    setVagaEsgotada(null);
    setMensalistaVencido(null);
    setRestricaoHorario(null);
    setLivreAPartirEntrada(null);

    // Já está no pátio (por placa ou pelo nº de controle)? Vai direto pra saída.
    // Antes do corte de 3 caracteres: número de controle costuma ter 1 ou 2.
    const jaNoPatio = encontrarNoPatio(p);
    if (jaNoPatio) { limparFormEntrada(); prepararSaida(jaNoPatio); return; }

    if (p.length < 3) return;

    // Já esteve aqui antes? Traz o modelo de volta pro campo Carro.
    if (!buscaModelo.trim()) {
      const { data: anterior } = await supabase.from('movimentos')
        .select('modelo').eq('placa', p).not('dt_saida', 'is', null)
        .order('dt_saida', { ascending: false }).order('hr_saida', { ascending: false })
        .limit(1).maybeSingle();
      preencherModeloConhecido(anterior?.modelo);
    }

    const { data: mv } = await supabase.from('mensalista_veiculos').select('mensalista_id, modelo, tipo_veic').eq('placa', p).maybeSingle();
    if (!mv) return;
    const { data: m } = await supabase.from('mensalistas').select('*').eq('id', mv.mensalista_id).maybeSingle();
    if (!m || !m.ativo) return;

    // Fora do vencimento + tolerância? Entra como avulso (tabela normal, sem convênio).
    if (!dentroDoVencimento(m.proximo_pagamento, m.tolerancia_dias)) {
      setMensalistaVencido(m.razao);
      if (mv.tipo_veic) await registrarEntrada(mv.tipo_veic, mv.modelo, 'E', null);
      else preencherModeloConhecido(mv.modelo);
      return;
    }

    // Vagas contratadas já ocupadas por OUTROS veículos dele? Entra como avulso.
    // Só conta quem está de fato usando a vaga como mensalista (I/P/H) — um
    // carro irmão que entrou avulso (por vaga esgotada, vencimento, restrição
    // de horário…) não "toma" a vaga; senão, uma vez que um deles caísse pra
    // avulso, a vaga ficaria travada mesmo depois do titular sair.
    const { data: veiculosDele } = await supabase.from('mensalista_veiculos').select('placa').eq('mensalista_id', m.id);
    const outrasPlacas = (veiculosDele || []).map((v) => v.placa).filter((pl) => pl !== p);
    let ocupadas = 0;
    if (outrasPlacas.length) {
      const { count } = await supabase.from('movimentos')
        .select('id', { count: 'exact', head: true }).in('placa', outrasPlacas).in('tipo_mens', [...MENSALISTA])
        .is('dt_saida', null).is('excluido_em', null);
      ocupadas = count || 0;
    }
    if (ocupadas >= (m.qte_vagas || 1)) {
      setVagaEsgotada(m.razao);
      preencherModeloConhecido(mv.modelo);
      return;
    }

    // Dia/turno fora do contratado (RESTRM/RESTRT/RESTRN + PERIODO1/2/3)?
    // Entra como avulso, mas cobra só até o próximo turno contratado do dia
    // (ver calcularResultadoSaida) — não a estadia inteira.
    const restricao = calcularRestricaoEntrada({
      horaEntrada: agoraHHMM(), diaSemana: diaSemanaLegado(new Date()), mensalista: m,
    });
    if (!restricao.dentroDoHorario) {
      setRestricaoHorario({ nome: m.razao, livreAPartir: restricao.livreAPartir });
      setLivreAPartirEntrada(restricao.livreAPartir);
      if (mv.tipo_veic) await registrarEntrada(mv.tipo_veic, mv.modelo, 'E', null);
      else preencherModeloConhecido(mv.modelo);
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

    preencherModeloConhecido(mv.modelo);
    setDetectado({ nome: m.razao, tipo_mens: m.tipo_mens, convenio_codigo: convCod });
  }

  /**
   * Pré-preenche o campo Carro com um modelo já conhecido (do catálogo, se
   * bater o nome; senão texto livre) — usado quando a entrada não se
   * completa sozinha (vaga esgotada, restrição de horário, mensalista sem
   * tabela cadastrada…) e o operador precisa terminar o formulário à mão.
   * Não sobrescreve o que o operador já tiver digitado.
   */
  function preencherModeloConhecido(nomeModelo) {
    if (!nomeModelo || buscaModelo.trim()) return;
    const match = modelos.find((m) => normalizar(m.nome) === normalizar(nomeModelo));
    if (match) selecionarModelo(match);
    else setBuscaModelo(nomeModelo);
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
    setRestricaoHorario(null); setLivreAPartirEntrada(null);
    setBuscaModelo(''); setModeloSelecionado(null); setMostrarSugestoes(false);
    setTabelaManual(''); setNomeCarroNovo(''); setConfirmNovo(null);
  }

  /**
   * Grava a entrada reservando o número de controle (@C#@) — o número curto que
   * o operador entrega ao cliente e recebe de volta na saída.
   *
   * O banco garante que ele não se repete entre os carros no pátio; se duas
   * cabines pegarem o mesmo número no mesmo instante, a segunda leva erro de
   * duplicidade e aqui tentamos o próximo livre.
   */
  async function inserirComControle(dados, tentativas = 3) {
    for (let i = 0; i < tentativas; i++) {
      const { data: proximo, error: errSeq } = await supabase.rpc('proximo_controle', { p_filial: perfil.filial_id });
      // Sem a migration 0020 no ar, segue sem número em vez de travar a entrada.
      if (errSeq && !dados.placa) {
        return { data: null, error: { message: 'Sem numeração de controle disponível — digite a placa (ou aplique a migration 0020).' } };
      }
      const payload = errSeq ? dados : {
        ...dados,
        controle: proximo,
        // Carro sem placa: o próprio nº de controle vira o identificador, no
        // formato $$$0042 do sistema antigo. Lá o $$$ vinha de um contador
        // separado; aqui é o mesmo número do ticket, então o operador tem um
        // só pra procurar.
        placa: dados.placa || placaSemChapa(proximo),
      };
      const res = await supabase.from('movimentos').insert(payload).select().single();
      if (!res.error) return res;
      const colidiuNoControle = res.error.code === '23505' && String(res.error.message).includes('controle');
      if (!colidiuNoControle) return res;
    }
    return { data: null, error: { message: 'Não consegui reservar um número de controle livre. Tente de novo.' } };
  }

  /**
   * `livreAPartir` (omitido = usa o que `detectar()` calculou, se houver):
   * fora do dia/turno contratado, é o horário em que a saída passa a cobrar
   * avulso só até ali. `undefined` explícito porque `null` é um valor válido
   * (default explícito no parâmetro só entraria com `undefined`).
   */
  async function registrarEntrada(tipoVeic, nomeModelo, tipoMens, convenioCodigo, livreAPartir = livreAPartirEntrada) {
    const p = placa.trim().toUpperCase();
    const dtEntrada = hojeISO();
    const hrEntrada = agoraHHMM();
    const nomeMensalista = detectado?.nome || '';
    const tipoMensFinal = tipoMens ?? detectado?.tipo_mens ?? 'E';
    // `select()` para ter o movimento gravado — é dele que sai o ticket.
    const { data: novo, error } = await inserirComControle({
      filial_id: perfil.filial_id, placa: p, modelo: nomeModelo || null,
      dt_entrada: dtEntrada, hr_entrada: hrEntrada,
      tipo_veic: tipoVeic,
      tipo_mens: tipoMensFinal,
      convenio_codigo: convenioCodigo ?? detectado?.convenio_codigo ?? null,
      livre_a_partir: livreAPartir ?? null,
      usuario_entrada: perfil.id,
    });
    if (error) { setErro(error.code === '23505' ? 'Essa placa já está no pátio.' : error.message); return; }
    // Mensalista/hóspede de verdade (não o que caiu pra avulso por
    // vencimento/vaga/restrição — esse continua mostrando, é cobrança real):
    // respeita a preferência de não parar na tela do ticket.
    if (MENSALISTA.has(tipoMensFinal) && !imprimeTicketMensalista) {
      setCelularTicket('');
      setPlacaTicket('');
      limparFormEntrada();
      recarregar();
      focarPlaca(); // sem ticket pra fechar, ninguém mais devolve o foco à placa
      return;
    }
    setTicket(comModelo('entrada', {
      titulo: 'Ticket de entrada',
      linhas: [
        ...(novo?.controle != null ? [['Controle', String(novo.controle).padStart(4, '0')]] : []),
        ['Placa', novo?.placa || p],
        ['Carro', nomeModelo || '—'],
        ['Tabela', tipoVeic],
        ['Entrada', `${dtEntrada.split('-').reverse().join('/')} ${fmtHora(Number(hrEntrada))}`],
        ['Operador', perfil.nome],
      ],
    }, {
      ...dadosMovimento({ movimento: novo, operador: perfil.nome }),
      MENSALISTA: nomeMensalista,
    }));
    setPlacaTicket(novo?.placa || p);
    setCelularTicket(await celularSalvo(novo?.placa || p));
    limparFormEntrada();
    recarregar();
  }

  async function darEntrada(e) {
    e.preventDefault();
    setErro('');
    const p = placa.trim().toUpperCase();

    // Segurança extra (ex.: Enter sem sair do campo, sem disparar o onBlur).
    const jaNoPatio = encontrarNoPatio(p);
    if (jaNoPatio) { limparFormEntrada(); prepararSaida(jaNoPatio); return; }

    // Enter com a placa em branco: entra sem placa e o nº de controle vira o
    // identificador ($$$0042), como no sistema antigo.
    if (p && !REGEX_PLACA.test(p)) { setConfirmPlaca(p); return; }
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

  /**
   * Serviço cuja tabela de preço tem faixa "Pede valor" (ver Precos.jsx):
   * normalmente é assim que esse tipo de faixa é usado — preço variável por
   * serviço (ex.: lavagem cujo preço depende do carro) — então pergunta o
   * valor aqui, ao MARCAR o serviço, em vez de deixar pra saída como as
   * faixas 'valor' da tabela do próprio veículo/convênio (essas continuam
   * perguntando na saída — ver abrirValorObrigatorioSePreciso).
   */
  function servicoPedeValor(servico) {
    return !!tabelas[servico?.tabela_tipo]?.faixas?.some((f) => f.tipoCobranca === 'valor');
  }

  async function alternarServico(servicoId) {
    if (!modalServicos) return;
    const { mov, marcados } = modalServicos;
    const jaMarcado = marcados.has(servicoId);
    if (!jaMarcado) {
      const servico = servicos.find((s) => s.id === servicoId);
      if (servicoPedeValor(servico)) {
        setModalValorServico({ servicoId, descricao: servico.descricao, valor: '' });
        return;
      }
    }
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

  async function confirmarValorServico() {
    const valor = Number(modalValorServico.valor);
    if (!(valor >= 0)) { setErro('Informe um valor válido.'); return; }
    const { mov, marcados } = modalServicos;
    const { error } = await supabase.from('movimento_servicos')
      .insert({ filial_id: perfil.filial_id, movimento_id: mov.id, servico_id: modalValorServico.servicoId, valor });
    if (error) { setErro(error.message); return; }
    const novosMarcados = new Set(marcados);
    novosMarcados.add(modalValorServico.servicoId);
    setModalServicos({ mov, marcados: novosMarcados });
    setMovimentosComServico((prev) => new Set(prev).add(mov.id));
    setModalValorServico(null);
  }

  async function buscarServicosDoMovimento(movimentoId) {
    const { data } = await supabase.from('movimento_servicos').select('servico_id, valor').eq('movimento_id', movimentoId);
    const valorPorServico = new Map((data || []).map((r) => [r.servico_id, r.valor]));
    return servicos
      .filter((s) => valorPorServico.has(s.id))
      .map((s) => ({ ...s, valorInformado: valorPorServico.get(s.id) }));
  }

  // Operador só exclui nos primeiros 5min da entrada; do gerente pra cima, sem limite.
  function podeExcluir(mov) {
    if (ehGerente(perfil)) return true;
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
    setPlacaTicket('');
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
    setPlacaTicket('');
  }

  function calcularResultadoSaida(mov, convenioCodigo, servicosSelecionados) {
    if (MENSALISTA.has(mov.tipo_mens)) {
      // Mensalista: já paga a mensalidade; saída sem cobrança nesta fase.
      return { valor: 0, valorProporcional: 0, valorConvenio: 0, pontos: 0, mensalista: true, tempoDecorrido: 0 };
    }

    // Serviços com valor já informado ao marcar (ver servicoPedeValor) somam
    // direto, fora do motor — os demais entram na soma por tabela de sempre.
    const comValor = (servicosSelecionados || []).filter((s) => s.valorInformado != null);
    const semValor = (servicosSelecionados || []).filter((s) => s.valorInformado == null);
    const somaServicosComValor = comValor.reduce((t, s) => t + Number(s.valorInformado), 0);
    const servicosTipos = semValor.map((s) => s.tabela_tipo);
    // Só serviço(s) com valor, nenhum por tabela: sem isso o motor cairia de
    // volta na tabela do VEÍCULO (servicosTipos vazio = "nenhum serviço") e
    // cobraria os dois juntos — mas a regra é sempre "em vez da tabela do
    // veículo", nunca além dela (ver texto do modal de Serviços).
    const soServicoComValor = comValor.length > 0 && semValor.length === 0;
    // Soma nos dois: valorProporcional (o "cheio") e valor (o cobrado) andam
    // juntos aqui, sem desconto de convênio — sem isso o BI via a diferença
    // entre os dois como se fosse desconto de convênio, o que não é.
    const comSomaServicos = (resultado) => ({
      ...resultado,
      ...(soServicoComValor ? { valorConvenio: 0, manual: false, pedeValor: false } : {}),
      valorProporcional: Math.round(((soServicoComValor ? 0 : resultado.valorProporcional) + somaServicosComValor) * 100) / 100,
      valor: Math.round(((soServicoComValor ? 0 : resultado.valor) + somaServicosComValor) * 100) / 100,
    });

    // Entrou fora do dia/turno contratado (ver detectar()): cobra avulso só
    // até o horário guardado em livre_a_partir — dali em diante já está
    // dentro do período contratado, sem cobrança. Só vale no mesmo dia da
    // entrada (a restrição não tenta prever o dia seguinte), só depois que a
    // saída realmente ultrapassa esse horário (antes disso é avulso normal,
    // pela permanência real — o boundary nunca chegou a valer), e só sem
    // convênio escolhido à mão (escolha do operador tem prioridade).
    if (!convenioCodigo && mov.livre_a_partir != null && mov.dt_entrada === hojeISO() && agoraHHMM() > Number(mov.livre_a_partir)) {
      const parcial = calcularTarifa({
        tabelas, tipoVeic: mov.tipo_veic,
        servicosTipos: servicosTipos.length ? servicosTipos : undefined,
        movimento: {
          dtEntrada: dataDeISO(mov.dt_entrada), entrada: Number(mov.hr_entrada),
          dtSaida: dataDeISO(mov.dt_entrada), saida: Number(mov.livre_a_partir),
        },
      });
      return comSomaServicos({
        ...parcial,
        // Tempo mostrado ao operador é o real (quanto tempo o carro ficou),
        // mesmo cobrando só a parte fora do horário contratado.
        tempoDecorrido: horasDecorridas({ dtEntrada: dataDeISO(mov.dt_entrada), entrada: Number(mov.hr_entrada), dtSaida: new Date(), saida: agoraHHMM() }),
        restricaoAte: Number(mov.livre_a_partir),
      });
    }

    const convenio = convenioCodigo ? mapConvenio(convenios[convenioCodigo]) : undefined;
    return comSomaServicos(calcularTarifa({
      tabelas, tipoVeic: mov.tipo_veic, convenio,
      servicosTipos: servicosTipos.length ? servicosTipos : undefined,
      movimento: { dtEntrada: dataDeISO(mov.dt_entrada), entrada: Number(mov.hr_entrada), dtSaida: new Date(), saida: agoraHHMM() },
    }));
  }

  /**
   * Faixa "Pede valor" (ver Precos.jsx): sem número configurado, o motor
   * devolve `pedeValor: true` e o operador precisa informar quanto cobrar
   * antes de conseguir confirmar a saída — abre o mesmo modal do "Alterar
   * valor" do menu ⋮, só que obrigatório (vazio, não pré-preenchido, e sem
   * marcar `valorCalculado`/o "*" — não houve valor calculado pra alterar,
   * é assim que essa faixa sempre cobra).
   */
  function abrirValorObrigatorioSePreciso(resultado) {
    if (resultado.pedeValor) setModalValor({ valor: '', obrigatorio: true });
  }

  async function prepararSaida(mov) {
    try {
      const servicosSelecionados = await buscarServicosDoMovimento(mov.id);
      const convenioCodigo = mov.convenio_codigo || '';
      const resultado = calcularResultadoSaida(mov, convenioCodigo, servicosSelecionados);
      const formaPadrao = formas.find((f) => f.eh_dinheiro)?.codigo || formas[0]?.codigo || 'D';
      setSaindo({ mov, convenioCodigo, servicosSelecionados, resultado, pagamentos: [{ forma: formaPadrao, valor: resultado.valor }] });
      abrirValorObrigatorioSePreciso(resultado);
    } catch (e) { setErro(e.message); }
  }

  function mudarConvenioSaida(codigo) {
    if (!saindo) return;
    try {
      const resultado = calcularResultadoSaida(saindo.mov, codigo, saindo.servicosSelecionados);
      const formaAtual = saindo.pagamentos[0]?.forma || formas.find((f) => f.eh_dinheiro)?.codigo || formas[0]?.codigo || 'D';
      setSaindo({ ...saindo, convenioCodigo: codigo, resultado, pagamentos: [{ forma: formaAtual, valor: resultado.valor }] });
      abrirValorObrigatorioSePreciso(resultado);
    } catch (e) { setErro(e.message); }
  }

  function abrirModalDps() {
    setModalDps({ documento: '', nome: '' });
  }

  function abrirModalValor() {
    setModalValor({ valor: String(saindo.resultado.valor), obrigatorio: false });
  }

  /**
   * Confirma o valor digitado no modal — serve tanto pro "Alterar valor"
   * opcional do ⋮ quanto pro obrigatório da faixa "Pede valor"
   * (`modalValor.obrigatorio` distingue os dois): o opcional guarda o valor
   * original em `valorCalculado` (pra marcar "*" nas listagens; se alterar de
   * novo, o original continua sendo o do motor, não o da alteração anterior);
   * o obrigatório não — não houve valor calculado, é assim que a faixa cobra.
   * Os dois zeram `pedeValor` e o pagamento acompanha o valor novo.
   */
  function confirmarAlteracaoValor() {
    const novo = Number(modalValor.valor);
    if (!(novo >= 0)) { setErro('Informe um valor válido.'); return; }
    setSaindo((s) => ({
      ...s,
      ...(modalValor.obrigatorio ? {} : { valorCalculado: s.valorCalculado ?? s.resultado.valor }),
      resultado: {
        ...s.resultado,
        valor: novo,
        // "Pede valor" não tinha cálculo nenhum — o "cheio" é o que foi
        // digitado. "Alterar valor" só sobe o cheio se o novo valor passar
        // do que a tabela tinha calculado (senão o BI mostraria desconto
        // negativo — Faturamento nunca pode ficar abaixo do que foi cobrado).
        valorProporcional: modalValor.obrigatorio ? novo : Math.max(s.resultado.valorProporcional, novo),
        pedeValor: false,
      },
      pagamentos: [{ forma: s.pagamentos[0]?.forma || formas.find((f) => f.eh_dinheiro)?.codigo || formas[0]?.codigo || 'D', valor: novo }],
    }));
    setModalValor(null);
  }

  /**
   * "Cadastrar senha do mês" (menu ⋮) — qualquer pessoa da filial que
   * recebeu a senha do fornecedor por WhatsApp digita ela aqui, sem
   * precisar do fornecedor. O cálculo/comparação roda só no servidor (ver
   * api/cadastrar-senha-mes.js) — esta tela nunca sabe se está certa, o
   * cadastro aceita qualquer coisa, só é conferido no 1º acesso do mês.
   * 6 campos fixos (um por posição da fila): os já cadastrados aparecem em
   * texto normal (travados) — quem cadastra já tinha esse valor em mãos, não
   * tem problema mostrar de volta — e "Cadastrar" manda de uma vez só os
   * campos vazios que foram preenchidos.
   */
  async function chamarSenhaMes(body) {
    const { data: sessao } = await supabase.auth.getSession();
    const resp = await fetch('/api/cadastrar-senha-mes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.session?.access_token}` },
      body: JSON.stringify(body),
    });
    return { ok: resp.ok, dados: await resp.json().catch(() => ({})) };
  }

  async function atualizarListaSenhaMes() {
    const { ok, dados } = await chamarSenhaMes({ acao: 'listar' });
    const travadas = ok ? (dados.senhas || []) : [];
    setModalSenhaMes((m) => ({
      ...(m || {}),
      ocupado: false,
      travadas,
      campos: Array.from({ length: 6 - travadas.length }, () => ''),
    }));
  }

  function abrirModalSenhaMes() {
    setModalSenhaMes({ travadas: null, campos: [], erro: '', ocupado: false });
    atualizarListaSenhaMes();
  }

  async function cadastrarSenhaMes() {
    const pendentes = modalSenhaMes.campos.filter((c) => c.trim());
    if (pendentes.length === 0) return;
    setModalSenhaMes((m) => ({ ...m, ocupado: true, erro: '' }));
    for (const senha of pendentes) {
      const { ok, dados } = await chamarSenhaMes({ senha });
      if (!ok || dados.erro) {
        setModalSenhaMes((m) => ({ ...m, ocupado: false, erro: dados.erro || 'Não deu pra cadastrar.' }));
        return;
      }
    }
    await atualizarListaSenhaMes();
  }

  async function removerUltimaSenhaMes() {
    setModalSenhaMes((m) => ({ ...m, ocupado: true, erro: '' }));
    const { ok, dados } = await chamarSenhaMes({ acao: 'remover_ultima' });
    if (!ok || dados.erro) {
      setModalSenhaMes((m) => ({ ...m, ocupado: false, erro: dados.erro || 'Não deu pra remover.' }));
      return;
    }
    await atualizarListaSenhaMes();
  }

  async function confirmarSaida(tomadorDps) {
    const { mov, resultado, pagamentos, convenioCodigo, valorCalculado } = saindo;
    const dtSaida = hojeISO();
    const hrSaida = agoraHHMM();
    // Liga ao caixa aberto do operador (se houver), para o fechamento.
    const { data: cx } = await supabase.from('caixas').select('id')
      .eq('operador_id', perfil.id).eq('status', 'aberto').maybeSingle();
    const valorFoiAlterado = valorCalculado != null && valorCalculado !== resultado.valor;
    const { error } = await supabase.from('movimentos').update({
      dt_saida: dtSaida, hr_saida: hrSaida,
      convenio_codigo: convenioCodigo || null,
      valor: resultado.valor, valor_proporcional: resultado.valorProporcional,
      valor_convenio: resultado.valorConvenio, pontos_ganhos: resultado.pontos,
      caixa_id: cx?.id ?? null, usuario_saida: perfil.id,
      // Só marca alteração se o valor final ficou mesmo diferente do calculado
      // (dá pra abrir o modal e confirmar o mesmo valor — isso não é alteração).
      valor_calculado: valorFoiAlterado ? valorCalculado : null,
      usuario_altera: valorFoiAlterado ? perfil.id : null,
      dt_altera: valorFoiAlterado ? new Date().toISOString() : null,
    }).eq('id', mov.id);
    if (error) { setErro(error.message); return; }

    // Rateio de pagamento.
    const pagos = pagamentos.filter((p) => Number(p.valor) > 0);
    const linhasPag = pagos.map((p) => ({ filial_id: perfil.filial_id, movimento_id: mov.id, forma_pagamento: p.forma, valor: Number(p.valor) }));
    if (linhasPag.length) await supabase.from('movimento_pagamentos').insert(linhasPag);

    // Fidelidade (best-effort).
    if (!resultado.mensalista) await atualizarFidelidade(mov.placa, resultado.pontos);

    let ticketRps = null;
    if (tomadorDps) {
      const { error: errNota, nota } = await criarNotaFiscal(supabase, {
        filialId: perfil.filial_id, movimentoId: mov.id, competencia: dtSaida,
        valor: resultado.valor, tomador: tomadorDps,
      });
      if (errNota) setErro(errNota);
      // Com nota gerada, o comprovante de saída ganha o botão "Imprimir RPS".
      if (nota) {
        ticketRps = montarTicketRps({
          nota, filial, modelo: modelosTicket.rps,
          movimento: { ...mov, dt_saida: dtSaida, hr_saida: hrSaida, valor: resultado.valor },
        });
      }
    }
    setModalDps(null);

    const formaTexto = resultado.mensalista ? 'Mensalista/hóspede'
      : (pagos.map((p) => formas.find((f) => f.codigo === p.forma)?.descricao || p.forma).join(' + ') || '—');
    const { servicosSelecionados } = saindo;
    const ticketSaida = comModelo('saida', {
      titulo: 'Ticket de saída',
      linhas: [
        ...(mov.controle != null ? [['Controle', String(mov.controle).padStart(4, '0')]] : []),
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
    }, {
      ...dadosMovimento({
        movimento: { ...mov, dt_saida: dtSaida, hr_saida: hrSaida, valor: resultado.valor },
        resultado, operador: perfil.nome,
        servicos: servicosSelecionados, convenio: convenios[convenioCodigo],
      }),
      MOEDA: formaTexto,
    });
    // Mensalista/hóspede de verdade (sem cobrança) respeita a preferência de
    // não parar na tela do ticket — quem foi cobrado (mesmo um mensalista
    // fora do horário/vencido) sempre vê o comprovante, é dinheiro de verdade.
    if (!(resultado.mensalista && !imprimeTicketMensalista)) {
      setTicket({ ...ticketSaida, ticketRps });
      setPlacaTicket(mov.placa);
      setCelularTicket(await celularSalvo(mov.placa));
    }
    setSaindo(null); recarregar();
    if (resultado.mensalista && !imprimeTicketMensalista) focarPlaca(); // sem ticket pra fechar, idem
  }

  async function reimprimirSaida(mov) {
    const { data: pagtos } = await supabase.from('movimento_pagamentos')
      .select('forma_pagamento, valor').eq('movimento_id', mov.id);
    const formaTexto = pagtos && pagtos.length
      ? pagtos.map((p) => formas.find((f) => f.codigo === p.forma_pagamento)?.descricao || p.forma_pagamento).join(' + ')
      : (MENSALISTA.has(mov.tipo_mens) ? 'Mensalista/hóspede' : '—');
    const valorConvenio = Number(mov.valor_convenio || 0);
    const servicosDoMov = await buscarServicosDoMovimento(mov.id);
    // O resultado do motor não fica gravado; pra reimpressão basta o que está
    // no movimento + a permanência recalculada a partir dos horários.
    const permanencia = permanenciaDe(mov);
    setTicket(comModelo('saida', {
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
    }, {
      ...dadosMovimento({
        movimento: mov,
        resultado: { valor: Number(mov.valor || 0), valorConvenio, tempoDecorrido: permanencia },
        operador: perfil.nome, servicos: servicosDoMov, convenio: convenios[mov.convenio_codigo],
      }),
      MOEDA: formaTexto,
    }));
    setPlacaTicket(mov.placa);
    setCelularTicket(await celularSalvo(mov.placa));
  }

  /**
   * 2ª via do comprovante de entrada — o cliente perdeu o ticket e o veículo
   * ainda está no pátio. O modelo padrão traz o termo de retirada com
   * assinatura, como no TICKET2 do sistema antigo.
   */
  async function segundaVia(mov) {
    setTicket(comModelo('segunda_via', {
      titulo: 'Ticket de entrada (2ª via)',
      linhas: [
        ...(mov.controle != null ? [['Controle', String(mov.controle).padStart(4, '0')]] : []),
        ['Placa', mov.placa],
        ['Carro', mov.modelo || '—'],
        ['Tabela', mov.tipo_veic],
        ['Entrada', `${mov.dt_entrada.split('-').reverse().join('/')} ${fmtHora(Number(mov.hr_entrada))}`],
        ['Reimpresso por', perfil.nome],
      ],
    }, dadosMovimento({ movimento: mov, operador: perfil.nome })));
    setPlacaTicket(mov.placa);
    setCelularTicket(await celularSalvo(mov.placa));
  }

  /**
   * Celular salvo pra essa placa (cadastro em `clientes`, o mesmo da
   * fidelidade) — pra pré-preencher o campo de WhatsApp em vez de vir em
   * branco de novo a cada entrada/saída do mesmo carro.
   */
  async function celularSalvo(placa) {
    try {
      const { data } = await supabase.from('clientes').select('telefone')
        .eq('placa', placa.trim().toUpperCase()).maybeSingle();
      return data?.telefone || '';
    } catch { return ''; }
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
        <div className="card-cab">
          <h2>Entrada de veículo</h2>
          <CardAcoes acoes={[
            { label: 'Receber mensalidade', onClick: () => setAbrirRecebimento(true) },
            { label: 'Cadastrar senha do mês', onClick: abrirModalSenhaMes },
          ]} />
        </div>
        <form className="linha-form" onSubmit={darEntrada}>
          <div className="campo">
            <label>Placa ou nº do ticket</label>
            <input className="mono" ref={placaRef} value={placa}
              onChange={(e) => { setPlaca(e.target.value); setConfirmPlaca(null); setVagaEsgotada(null); setMensalistaVencido(null); }}
              onBlur={(e) => detectar(e.target.value)}
              placeholder="ABC1D23" style={{ textTransform: 'uppercase', width: 220, fontSize: 18 }} />
            <span className="suave" style={{ fontSize: 11 }}>
              Na saída, o nº do ticket (ex.: 42) também serve.
            </span>
          </div>
          <CapturaPlaca onConfirmar={(p) => { setPlaca(p); setConfirmPlaca(null); setVagaEsgotada(null); setMensalistaVencido(null); detectar(p); }} />
          <div className="campo campo-busca" style={{ minWidth: 340 }}>
            <label>Carro</label>
            <input value={buscaModelo}
              onChange={(e) => onBuscaModeloChange(e.target.value)}
              onFocus={() => setMostrarSugestoes(true)}
              onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
              placeholder="Digite o modelo do carro…" style={{ width: '100%', fontSize: 18 }} />
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
          {restricaoHorario && (
            <span className="badge-mens" style={{ color: 'var(--ambar)', borderColor: 'var(--ambar)', background: 'rgba(245,166,35,.12)' }}>
              {restricaoHorario.nome} fora do dia/turno contratado — avulso
              {restricaoHorario.livreAPartir != null
                ? ` até as ${fmtHora(restricaoHorario.livreAPartir)}`
                : ' pelo período todo'}
            </span>
          )}
        </form>
      </div>

      <div className="card">
        <h2>No pátio ({patio.length}) — {avulsosNoPatio} avulso(s), {mensalistasNoPatio} mensalista(s)</h2>
        <div className="tabela-scroll">
          <table>
            <thead><tr><th>Nº</th><th>Placa</th><th>Carro</th><th>Tabela</th><th>Tipo</th><th>Entrada</th><th></th></tr></thead>
            <tbody>
              {patio.map((m) => (
                <tr key={m.id}>
                  {/* O número de controle é o que o cliente devolve na saída —
                      dá pra digitá-lo no mesmo campo da placa. */}
                  <td className="mono" style={{ fontWeight: 700 }}>
                    {m.controle != null ? String(m.controle).padStart(4, '0') : '—'}
                  </td>
                  <td>{semChapa(m.placa)
                    ? <span className="suave">{rotuloPlaca(m.placa)}</span>
                    : <span className="placa mono">{m.placa}</span>}</td>
                  <td>{m.modelo || '—'}</td>
                  <td>{m.tipo_veic}</td>
                  <td>{rotuloTipo(m.tipo_mens)}{m.convenio_codigo ? ` · ${m.convenio_codigo}` : ''}</td>
                  <td className="mono">{m.dt_entrada.split('-').reverse().join('/')} {fmtHora(Number(m.hr_entrada))}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {podeExcluir(m) && (
                      <button className="btn-ghost aviso-btn" onClick={() => abrirExclusao(m)}>Excluir</button>
                    )}
                    <button className="btn-ghost" onClick={() => segundaVia(m)} title="Cliente perdeu o ticket">2ª via</button>
                    <button
                      className={movimentosComServico.has(m.id) ? 'btn-servico-ativo' : 'btn-ghost'}
                      onClick={() => abrirServicosModal(m)}
                    >Serviço</button>
                    <button className="btn-primary" onClick={() => prepararSaida(m)}>Saída</button>
                  </td>
                </tr>
              ))}
              {patio.length === 0 && <tr><td colSpan={7} className="suave">Pátio vazio.</td></tr>}
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
                  <td>{semChapa(m.placa)
                    ? <span className="suave">{rotuloPlaca(m.placa)}{m.controle != null ? ` ${String(m.controle).padStart(4, '0')}` : ''}</span>
                    : <span className="placa mono">{m.placa}</span>}</td>
                  <td>{m.modelo || '—'}</td>
                  <td className="mono">
                    {m.excluido_em
                      ? new Date(m.excluido_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                      : fmtHora(Number(m.hr_saida))}
                  </td>
                  <td>
                    {m.excluido_em
                      ? <span className="status status-cancelada">Cancelado</span>
                      : (
                        <>
                          {fmtBRL(Number(m.valor || 0))}
                          {m.valor_calculado != null && (
                            <span title={`Valor alterado na saída — o cálculo dava ${fmtBRL(Number(m.valor_calculado))}`}> *</span>
                          )}
                        </>
                      )}
                  </td>
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
                {servicoPedeValor(s) && <span className="suave" style={{ fontSize: 11 }}> (pede valor ao marcar)</span>}
              </label>
            ))}
            <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-primary" onClick={() => setModalServicos(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {modalValorServico && (
        <div className="modal-bg" onClick={() => setModalValorServico(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Valor do serviço — {modalValorServico.descricao}</h2>
            <p className="suave">Esse serviço não tem valor configurado — digite quanto cobrar.</p>
            <div className="campo">
              <label>Valor</label>
              <input type="number" step="0.01" min="0" autoFocus value={modalValorServico.valor}
                onChange={(e) => setModalValorServico({ ...modalValorServico, valor: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmarValorServico(); }} />
            </div>
            <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => setModalValorServico(null)}>Cancelar</button>
              <button className="btn-primary" onClick={confirmarValorServico}>Marcar serviço</button>
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
        <TicketModal ticket={ticket} filial={filial} perfil={perfil} celular={celularTicket} placa={placaTicket}
          onCelular={setCelularTicket} onFechar={() => { setTicket(null); focarPlaca(); }} />
      )}

      {abrirRecebimento && (
        <ReceberMensalidadeFluxo perfil={perfil} formas={formas} caixaAberto={caixaAberto}
          onConcluido={(t, celularSugerido) => { setTicket(t); setCelularTicket(celularSugerido); setAbrirRecebimento(false); }}
          onFechar={() => setAbrirRecebimento(false)} />
      )}

      {modalSenhaMes && (
        <div className="modal-bg" onClick={() => setModalSenhaMes(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(480px, 92vw)' }}>
            <h2>Cadastrar senha do mês</h2>
            <p className="suave">
              Digite a senha do mês que você recebeu do fornecedor. Preencha só
              a 1ª pra um mês avulso, ou as 6 de uma vez pra um cliente
              semestral — cada uma vale pra um mês, na ordem.
            </p>
            <p className="suave" style={{ fontWeight: 600 }}>
              {modalSenhaMes.travadas == null ? 'Carregando…' : `${modalSenhaMes.travadas.length} de 6 já cadastradas.`}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '16px 0' }}>
              {Array.from({ length: 6 }, (_, i) => {
                const travada = modalSenhaMes.travadas?.[i];
                return (
                  <div className="campo" key={i} style={{ width: 62 }}>
                    <label style={{ fontSize: 11 }}>{i + 1}ª</label>
                    {travada != null ? (
                      <input className="mono" value={travada} disabled style={{ width: '100%', padding: '6px 4px', textAlign: 'center' }} />
                    ) : (
                      <input className="mono" autoFocus={i === (modalSenhaMes.travadas?.length || 0)}
                        value={modalSenhaMes.campos[i - (modalSenhaMes.travadas?.length || 0)] || ''}
                        onChange={(e) => {
                          const idx = i - (modalSenhaMes.travadas?.length || 0);
                          const campos = [...modalSenhaMes.campos];
                          campos[idx] = e.target.value.toUpperCase();
                          setModalSenhaMes({ ...modalSenhaMes, campos });
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !modalSenhaMes.ocupado) cadastrarSenhaMes(); }}
                        disabled={modalSenhaMes.travadas == null}
                        maxLength={5} style={{ width: '100%', padding: '6px 4px', textTransform: 'uppercase', textAlign: 'center' }} />
                    )}
                  </div>
                );
              })}
            </div>
            {modalSenhaMes.erro && <p className="aviso">{modalSenhaMes.erro}</p>}
            <div className="linha-form" style={{ justifyContent: 'space-between', marginTop: 12 }}>
              <button className="btn-ghost" disabled={modalSenhaMes.ocupado || !modalSenhaMes.travadas?.length} onClick={removerUltimaSenhaMes}>
                Remover última
              </button>
              <div className="linha-form" style={{ gap: 8 }}>
                <button className="btn-ghost" onClick={() => setModalSenhaMes(null)}>Fechar</button>
                <button className="btn-primary"
                  disabled={modalSenhaMes.ocupado || !modalSenhaMes.campos.some((c) => c.trim())}
                  onClick={cadastrarSenhaMes}>
                  {modalSenhaMes.ocupado ? '…' : 'Cadastrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {saindo && (
        <div className="modal-bg" onClick={() => setSaindo(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-cab">
              <h2>
                Saída — {semChapa(saindo.mov.placa)
                  ? <span className="suave">{rotuloPlaca(saindo.mov.placa)}</span>
                  : <span className="placa mono">{saindo.mov.placa}</span>}
                {saindo.mov.controle != null && (
                  <span className="suave mono" style={{ marginLeft: 8 }}>
                    nº {String(saindo.mov.controle).padStart(4, '0')}
                  </span>
                )}
              </h2>
              {!saindo.resultado.mensalista && (
                <CardAcoes acoes={[
                  { label: 'Alterar valor', onClick: abrirModalValor },
                  ...(saindo.resultado.valor > 0 ? [{ label: 'Gerar DPS', onClick: abrirModalDps }] : []),
                ]} />
              )}
            </div>
            {!saindo.resultado.mensalista && (
              <div className="campo" style={{ marginBottom: 10 }}>
                <label>Convênio (opcional — em branco cobra normal)</label>
                <select value={saindo.convenioCodigo} onChange={(e) => mudarConvenioSaida(e.target.value)}>
                  <option value="">— Sem convênio —</option>
                  {Object.values(convenios)
                    .filter((c) => c.ativo && (!c.so_supervisor || ehGerente(perfil)))
                    .map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.razao}</option>)}
                </select>
              </div>
            )}
            {saindo.resultado.mensalista ? (
              <p className="suave">Mensalista/hóspede — sem cobrança na saída (mensalidade paga à parte).</p>
            ) : (
              <>
                {/* A tabela usada é informação de diagnóstico: com Tabela alt.
                    no convênio, o cálculo sai da tabela DELE, não da de entrada. */}
                <p className="mono suave">
                  Tempo: {fmtHora(saindo.resultado.tempoDecorrido)} · tabela {tabelaDaSaida(saindo, convenios)}
                </p>
                {/* Quanto o convênio está bancando: sem isso, um convênio mal
                    cadastrado passa despercebido (o valor simplesmente não cai). */}
                {saindo.convenioCodigo && (
                  <p className={saindo.resultado.valorConvenio > 0 ? 'ok-txt' : 'aviso'} style={{ fontSize: 13 }}>
                    {saindo.resultado.valorConvenio > 0
                      ? `Convênio ${saindo.convenioCodigo} paga ${fmtBRL(saindo.resultado.valorConvenio)}`
                      : `Convênio ${saindo.convenioCodigo} sem desconto — confira o cadastro dele (% desc., valor fixo ou grade própria) e a coluna "Valor convênio" da tabela ${tabelaDaSaida(saindo, convenios)}.`}
                  </p>
                )}
                {/* Entrou fora do dia/turno contratado: cobra só até aqui —
                    dali em diante já estava dentro do período contratado. */}
                {saindo.resultado.restricaoAte != null && (
                  <p className="suave" style={{ fontSize: 13 }}>
                    Fora do horário contratado na entrada — cobrando só até as {fmtHora(saindo.resultado.restricaoAte)}
                    {' '}(quando o período contratado começa).
                  </p>
                )}
              </>
            )}
            {saindo.servicosSelecionados?.length > 0 && (() => {
              const comValor = saindo.servicosSelecionados.filter((s) => s.valorInformado != null);
              const semValor = saindo.servicosSelecionados.filter((s) => s.valorInformado == null);
              return (
                <>
                  {semValor.length > 0 && (
                    <p className="suave">
                      Cobrando por serviço: {semValor.map((s) => s.descricao).join(', ')}
                      {' '}(em vez da tabela do veículo)
                    </p>
                  )}
                  {comValor.map((s) => (
                    <p className="suave" key={s.id}>
                      + {s.descricao}: {fmtBRL(Number(s.valorInformado))} (valor informado ao marcar o serviço)
                    </p>
                  ))}
                </>
              );
            })()}
            <div className="grande">{fmtBRL(saindo.resultado.valor)}</div>
            {saindo.valorCalculado != null && saindo.valorCalculado !== saindo.resultado.valor && (
              <p className="suave" style={{ textAlign: 'center' }}>
                * valor alterado — o cálculo dava {fmtBRL(saindo.valorCalculado)}
              </p>
            )}

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
            {saindo.resultado.pedeValor && (
              <p className="aviso">
                Esta faixa pede o valor a cobrar —{' '}
                <button type="button" className="btn-ghost" onClick={abrirModalValor} style={{ padding: '2px 8px' }}>
                  informar valor
                </button>
              </p>
            )}
            <div className="linha-form" style={{ justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setSaindo(null)}>Cancelar</button>
              <button className="btn-primary" disabled={saindo.resultado.pedeValor} onClick={() => confirmarSaida()}>Confirmar saída</button>
            </div>
          </div>
        </div>
      )}

      {modalValor && (
        <div className="modal-bg" onClick={() => setModalValor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{modalValor.obrigatorio ? 'Valor a cobrar' : 'Alterar valor'} — <span className="placa mono">{saindo?.mov.placa}</span></h2>
            <p className="suave">
              {modalValor.obrigatorio
                ? 'Esta faixa da tabela de preço não tem valor configurado — digite quanto cobrar.'
                : <>O cálculo deu {fmtBRL(saindo?.resultado.valor || 0)}
                    {saindo?.valorCalculado != null && ` (original: ${fmtBRL(saindo.valorCalculado)})`}.
                    O valor original fica registrado, e a saída aparece marcada com * nas listagens.</>}
            </p>
            <div className="campo">
              <label>Valor a cobrar</label>
              <input type="number" step="0.01" min="0" autoFocus value={modalValor.valor}
                onChange={(e) => setModalValor({ ...modalValor, valor: e.target.value })} />
            </div>
            <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => setModalValor(null)}>Cancelar</button>
              <button className="btn-primary" onClick={confirmarAlteracaoValor}>Usar este valor</button>
            </div>
          </div>
        </div>
      )}

      {modalDps && (
        <div className="modal-bg" onClick={() => setModalDps(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Gerar DPS — <span className="placa mono">{saindo?.mov.placa}</span></h2>
            <p className="suave">
              Informe o CPF ou CNPJ do tomador do serviço. Deixe em branco para emitir
              sem identificação (usa não exigibilidade do NIF).
            </p>
            <div className="campo">
              <label>CPF/CNPJ (opcional)</label>
              <input className="mono" value={modalDps.documento}
                onChange={(e) => setModalDps({ ...modalDps, documento: e.target.value })}
                placeholder="Deixe em branco para não identificar" />
              {erroCpfCnpj(modalDps.documento)
                ? <span className="aviso" style={{ fontSize: 11 }}>{erroCpfCnpj(modalDps.documento)}</span>
                : !validarCpfCnpj(modalDps.documento).vazio && (
                  <span className="suave" style={{ fontSize: 11 }}>
                    {validarCpfCnpj(modalDps.documento).tipo} válido: {formatarCpfCnpj(modalDps.documento)}
                  </span>
                )}
            </div>
            <div className="campo">
              <label>Nome / Razão social (opcional)</label>
              <input value={modalDps.nome}
                onChange={(e) => setModalDps({ ...modalDps, nome: e.target.value })}
                placeholder="Em branco vira &quot;CONSUMIDOR&quot; no documento" />
            </div>
            <div className="linha-form" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => setModalDps(null)}>Cancelar</button>
              {/* Documento em branco é permitido (vira tomador não
                  identificado); errado, não — a prefeitura rejeitaria. */}
              <button className="btn-primary" disabled={!!erroCpfCnpj(modalDps.documento)}
                onClick={() => confirmarSaida({ cpf_cnpj: modalDps.documento, nome: modalDps.nome })}>
                Confirmar saída e gerar DPS
              </button>
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

/** Tabela que o motor usou: a do convênio (Tabela alt.), se houver, ou a da entrada. */
function tabelaDaSaida(saindo, convenios) {
  // Serviço com valor já informado ao marcar não passa pelo motor (ver
  // calcularResultadoSaida) — só entram aqui os que ainda dependem da tabela.
  const porTabela = saindo.servicosSelecionados?.filter((s) => s.valorInformado == null) || [];
  if (porTabela.length) return porTabela.map((s) => s.tabela_tipo).join('+');
  const alt = saindo.convenioCodigo ? convenios[saindo.convenioCodigo]?.tab_conv : null;
  return alt || saindo.mov.tipo_veic;
}

function mapConvenio(c) {
  if (!c) return undefined;
  return {
    codigo: c.codigo, tabConv: c.tab_conv || undefined, tabHoras: c.tab_horas,
    perConv: Number(c.perc_conv || 0), vlrConv: Number(c.vlr_conv || 0),
  };
}
