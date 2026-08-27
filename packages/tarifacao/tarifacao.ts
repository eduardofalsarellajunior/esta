/**
 * Motor de tarifação — réplica fiel da lógica do legado Clipper (HESTA).
 *
 * Fontes portados:
 *  - `SISPROC2.PRG`  → FUNCTION HORAS / MINUTO
 *  - `ESTALAN2.PRG`  → caminho de saída/cobrança (avulso + convênio)
 *
 * Função PURA, sem I/O. Convenção de tempo do legado: "hora comercial" HH.MM,
 * onde a parte decimal são MINUTOS (00–59), não fração de hora. Ex.: 14.30 = 14h30.
 *
 * ⚠️ Ver README.md quanto ao estado da reconciliação contra dados históricos e
 *    quanto às regras ainda NÃO portadas (corte de convênio em 2 segmentos,
 *    selos/vales, saldo devedor, fidelidade).
 */

/** Horário no formato "hora comercial" HH.MM (14.30 = 14h30). */
export type HoraComercial = number;

export interface Faixa {
  /** Teto de tempo da faixa, em HH.MM. */
  ate: HoraComercial;
  /** Valor cobrado nesta faixa (coluna HOR). Fixo (valor cheio) ou por hora, conforme `tipoCobranca`. */
  hor: number;
  /**
   * Valor que o convênio banca nesta faixa (coluna CON), quando a tabela é
   * usada como grade própria. Segue o mesmo `tipoCobranca` da faixa: fixo
   * substitui o total, 'hora' soma por hora (ver `calcularValorFaixas`).
   */
  con: number;
  /**
   * 'fixo': `hor` é o valor cheio da faixa (substitui o total acumulado até aqui).
   * 'hora': `hor` é uma taxa por PERÍODO (ver `periodo`), somada cumulativamente
   * a partir do teto da faixa anterior, com fração de período arredondada pra cima.
   * 'valor': sem valor pré-configurado — `hor` é ignorado; o operador informa
   * quanto cobrar na saída (ver `pedeValor` em `ResultadoTarifa`), e esse
   * valor passa a valer como se a faixa fosse 'fixo'.
   */
  tipoCobranca: 'fixo' | 'hora' | 'valor';
  /**
   * Duração do período de cobrança nas faixas 'hora', em HH.MM (1.00 = 1h,
   * padrão; 0.30 = 30min; 24.00 = 24h). Ignorado em faixas 'fixo'. Ausente ou
   * zero cai no padrão de 1h — preserva o comportamento de antes desta opção existir.
   */
  periodo?: HoraComercial;
}

export interface TabelaPreco {
  /** Código da tabela (ex.: "P", "G", "M", "D"). */
  tipo: string;
  /** Pontos de fidelidade concedidos (QTEPONTOS). */
  qtePontos?: number;
  /**
   * Valor FIXO do serviço (VALORSERV) — só usado quando a tabela entra em
   * `servicosTipos`: soma direto ao total, separado da estadia (faixas).
   * Não tem efeito quando a tabela é usada como `tipoVeic` normal.
   */
  valorServico?: number;
  /** Faixas de preço (até 45), em ordem crescente de `ate`. */
  faixas: Faixa[];
}

export interface Convenio {
  codigo: string;
  /** Usa OUTRA tabela de preço (tipo). Corresponde a TABCONV. */
  tabConv?: string;
  /** Usa as colunas CON da tabela como valor do convênio (TABHORAS="S"). */
  tabHoras?: boolean;
  /** Desconto percentual (PERCONV). */
  perConv?: number;
  /** Valor fixo de convênio (VLRCONV). Sobrepõe percentual e tabHoras. */
  vlrConv?: number;
}

export interface Movimento {
  dtEntrada: Date;
  entrada: HoraComercial;
  dtSaida: Date;
  saida: HoraComercial;
}

export interface EntradaCalculo {
  /** Tabelas disponíveis, indexadas por `tipo`. */
  tabelas: Record<string, TabelaPreco>;
  /** Tipo de veículo/tabela a usar (campo TIPOVEIC do movimento). */
  tipoVeic: string;
  movimento: Movimento;
  convenio?: Convenio;
  /**
   * Hora de corte do convênio (whoraconv). Quando o convênio troca de tabela
   * (`convenio.tabConv`) e a hora de corte é diferente da saída, a cobrança é
   * feita em DOIS segmentos: entrada→corte na tabela do convênio, corte→saída
   * na tabela original. Réplica de ESTALAN2.PRG:473-534.
   */
  horaConvenio?: HoraComercial;
  /**
   * Códigos de tabela dos serviços marcados no veículo (ex.: lavagem,
   * polimento). Quando presente e não vazio, o valor proporcional vira a
   * SOMA do valor FIXO de cada uma dessas tabelas (`valorServico`, legado
   * VALORSERV) MAIS a estadia (faixas) calculada por UMA delas — a primeira
   * da lista, tanto faz qual, é a mesma permanência real — em vez de somar a
   * estadia várias vezes. Substitui o valor da tabela do veículo (`tipoVeic`).
   * O resto do pipeline (convênio, selos, vales, piso) segue igual.
   */
  servicosTipos?: string[];
  /** Quantidade de selos usados (dok="V" / conv.selos). */
  selos?: number;
  /** Valor unitário do selo (conv.valorSelo). */
  valorSelo?: number;
  /** Quantidade de vales usados. */
  vales?: number;
  /** Valor unitário do vale. */
  valorVale?: number;
  /** Saldo devedor acumulado de saídas anteriores (VALORDEV), somado ao fim. */
  dividaAnterior?: number;
  /** Valor já pago em cobrança anterior (recobrança/2ª via): valor+valorConv. */
  valorJaPago?: number;
  /** Bônus de fidelidade a abater (BONUSFIDE). */
  bonusFidelidade?: number;
  /** Ajuste percentual por forma de pagamento (ESTAPGTO.PERCPGTO). */
  percFormaPagto?: number;
}

export interface ResultadoTarifa {
  /** Tempo decorrido total, em HH.MM (função HORAS). */
  tempoDecorrido: HoraComercial;
  /** Valor de tabela cheio, antes do convênio (VALORPROP). */
  valorProporcional: number;
  /** Desconto/valor de convênio (VALORCONV). */
  valorConvenio: number;
  /** Total abatido em selos (selos × valorSelo). */
  valorSelos: number;
  /** Total abatido em vales (vales × valorVale). */
  valorVales: number;
  /** Valor final a cobrar (piso em zero, já somado o saldo devedor anterior). */
  valor: number;
  /** Pontos de fidelidade concedidos. */
  pontos: number;
  /** true se o tempo estourou todas as faixas (o legado pediria valor manual). */
  manual: boolean;
  /** true se a faixa alcançada é do tipo 'valor' — precisa que o operador informe quanto cobrar. */
  pedeValor: boolean;
  /** Detalhe dos segmentos, quando a cobrança é em 2 partes (corte de convênio). */
  segmentos?: Array<{ valor: number }>;
}

// ---------------------------------------------------------------------------
// Primitivas de tempo (SISPROC2.PRG)
// ---------------------------------------------------------------------------

/** Converte um HH.MM em minutos totais. Réplica de FUNCTION MINUTO. */
export function minuto(hhmm: HoraComercial): number {
  const c = Math.round(hhmm * 100);
  const h = Math.trunc(c / 100);
  const m = c % 100;
  return h * 60 + m;
}

/** Diferença em dias inteiros entre duas datas (ignora horário). */
export function diffDias(a: Date, b: Date): number {
  const toDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((toDay(b) - toDay(a)) / 86_400_000);
}

/**
 * Tempo decorrido entre entrada e saída, em HH.MM. Réplica de FUNCTION HORAS.
 * Retorna 0 se não houver saída.
 */
export function horas(mov: Movimento): HoraComercial {
  const { dtEntrada, entrada, dtSaida, saida } = mov;
  const fie = Math.trunc(entrada);
  const ffe = Math.round((entrada - fie) * 100);
  const daydiff = diffDias(dtEntrada, dtSaida);
  const tot = saida + daydiff * 24;
  const totC = Math.round(tot * 100);
  const fis = Math.trunc(totC / 100);
  const ffs = totC % 100;
  const fte = fie * 60 + ffe;
  const fts = fis * 60 + ffs;
  const ft = fts - fte;
  const fti = Math.trunc(ft / 60);
  const ftf = ft - Math.trunc(ft / 60) * 60;
  return fti + ftf / 100;
}

/** Re-encoda minutos totais em HH.MM (parte decimal = minutos). */
export function minutosParaHHMM(min: number): HoraComercial {
  const hh = Math.trunc(min / 60);
  const mm = min - hh * 60;
  return hh + mm / 100;
}

// ---------------------------------------------------------------------------
// Seleção de faixa e cálculo
// ---------------------------------------------------------------------------

/**
 * Seleciona a menor faixa cujo teto `ate` ≥ tempo (comparação por centésimos,
 * como o legado faz via STR(x*100,10)). Retorna null se estourar as faixas.
 */
export function selecionaFaixa(
  faixas: Faixa[],
  tempo: HoraComercial,
  usarConv = false,
): { valor: number; indice: number } | null {
  const alvo = Math.round(tempo * 100);
  for (let i = 0; i < faixas.length; i++) {
    const f = faixas[i]!;
    if (alvo <= Math.round(f.ate * 100)) {
      return { valor: usarConv ? f.con : f.hor, indice: i + 1 };
    }
  }
  return null;
}

/**
 * Calcula o valor do tempo residual percorrendo as faixas em ordem, com uma
 * "fronteira" (teto da faixa anterior, começando em 0:00) e um total
 * acumulado:
 *  - Faixa 'fixo': o total VIRA o valor da faixa (substitui, não soma, o que
 *    veio antes) — é o comportamento de sempre (lookup único).
 *  - Faixa 'hora': soma ao total `periodos × hor`, onde `periodos` é o tempo
 *    entre a fronteira e (o tempo, se cai nesta faixa; senão o teto desta
 *    faixa), dividido pela duração de `periodo` (padrão 1h) e sempre
 *    arredondado pra cima (fração de período conta como um período cheio).
 *  - Faixa 'valor' (só na coluna `hor` — a que o cliente paga): não tem valor
 *    configurado, então curto-circuita e devolve `pedeValor: true` assim que
 *    o percurso alcança essa faixa — seja ela a que bate (`dentro`) ou uma
 *    que o tempo já ultrapassou a caminho de uma faixa seguinte. Não dá pra
 *    saber quanto ela "contribuiria" pro total sem a entrada do operador
 *    (ver Patio.jsx), então a resposta é sempre perguntar, nunca assumir 0.
 *    Na coluna `con` (grade de convênio), uma faixa 'valor' vale `0` sem
 *    perguntar nada — pedir valor de convênio no meio da saída é outra
 *    frente, fora de escopo por ora.
 * A fronteira avança para o teto da faixa a cada passo, fixo ou hora.
 * Retorna null se o tempo estourar todas as faixas (igual antes).
 */
export function calcularValorFaixas(
  faixas: Faixa[],
  tempo: HoraComercial,
  coluna: 'hor' | 'con' = 'hor',
): { valor: number; indice: number; pedeValor?: boolean } | null {
  const alvo = Math.round(tempo * 100);
  let fronteira: HoraComercial = 0;
  let total = 0;
  for (let i = 0; i < faixas.length; i++) {
    const f = faixas[i]!;
    const dentro = alvo <= Math.round(f.ate * 100);

    if (f.tipoCobranca === 'valor' && coluna === 'hor') {
      return { valor: 0, indice: i + 1, pedeValor: true };
    }

    const preco = coluna === 'con' ? f.con : f.hor;
    if (f.tipoCobranca === 'hora') {
      const fimBloco = dentro ? tempo : f.ate;
      // periodo ausente/zero (faixas de antes desta opção existir) = 1h, o
      // comportamento de sempre. Guarda contra período zero (evitaria divisão
      // por zero / Infinity).
      const periodoMin = minuto(f.periodo ?? 1.0) || 60;
      const periodos = Math.ceil((minuto(fimBloco) - minuto(fronteira)) / periodoMin);
      total += periodos * preco;
    } else {
      // 'fixo', e 'valor' quando coluna==='con' (sem pedido de entrada aqui —
      // vale 0, não desconta nada nessa faixa pro convênio).
      total = f.tipoCobranca === 'valor' ? 0 : preco;
    }

    if (dentro) return { valor: total, indice: i + 1 };
    fronteira = f.ate;
  }
  return null;
}

/**
 * Valor proporcional (de tabela, pré-convênio): faixa do tempo decorrido.
 * Réplica do trecho avulso de ESTALAN2.PRG (linhas 443-472).
 */
export function calcularProporcional(
  tbl: TabelaPreco,
  mov: Movimento,
): { valor: number | null; pedeValor?: boolean } {
  const faixa = calcularValorFaixas(tbl.faixas, horas(mov));
  return { valor: faixa === null ? null : faixa.valor, pedeValor: faixa?.pedeValor };
}

/**
 * Cálculo completo da tarifa de saída (avulso + convênio simples).
 *
 * Cobertura atual: proporcional (faixas) ou soma de tabelas de serviços
 * (`servicosTipos`), convênio por tabela alternativa (TABCONV), por grade
 * própria (TABHORAS/CON), percentual (PERCONV) e valor fixo (VLRCONV), piso
 * em zero, pontos e ajuste por forma de pagamento.
 */
export function calcularTarifa(input: EntradaCalculo): ResultadoTarifa {
  const {
    tabelas, tipoVeic, movimento, convenio, horaConvenio, servicosTipos,
    selos = 0, valorSelo = 0, vales = 0, valorVale = 0,
    dividaAnterior = 0, valorJaPago = 0, bonusFidelidade = 0, percFormaPagto,
  } = input;

  // Convênio pode trocar a tabela de preço (TABCONV).
  const tipoEfetivo = convenio?.tabConv || tipoVeic;
  const tbl = tabelas[tipoEfetivo];
  if (!tbl) {
    throw new Error(`Tabela de preço não encontrada: "${tipoEfetivo}"`);
  }

  const tempoDecorrido = horas(movimento);

  let valorProporcional: number;
  let manual: boolean;
  let pedeValor: boolean;
  let segmentos: ResultadoTarifa['segmentos'];
  // Pontos de fidelidade: por padrão os da tabela do VEÍCULO — mas quando a
  // cobrança vem de serviços (servicosTipos), os pontos são das tabelas dos
  // serviços, não do veículo (senão um cliente que só usa lava-rápido nunca
  // acumula ponto nenhum, mesmo a tabela do serviço tendo qte_pontos > 0).
  let pontos = tbl.qtePontos ?? 0;

  // Cobrança em DOIS segmentos: convênio com hora de corte + tabela original.
  const doisSegmentos =
    convenio?.tabConv != null &&
    horaConvenio != null &&
    horaConvenio !== movimento.saida;

  if (servicosTipos && servicosTipos.length > 0) {
    // Serviços marcados: soma o valor FIXO de cada tabela de serviço
    // (valorServico/VALORSERV) — a estadia (faixas) entra só UMA vez, pela
    // primeira tabela da lista (tanto faz qual: é a mesma permanência real,
    // não uma por serviço — somar as faixas de novo pra cada serviço
    // cobraria a estadia várias vezes).
    let somaFixos = 0;
    let pontosServicos = 0;
    for (const tipoServico of servicosTipos) {
      const tblServico = tabelas[tipoServico];
      if (!tblServico) {
        throw new Error(`Tabela de preço não encontrada: "${tipoServico}"`);
      }
      somaFixos += tblServico.valorServico ?? 0;
      pontosServicos += tblServico.qtePontos ?? 0;
    }
    const tblEstadia = tabelas[servicosTipos[0]];
    const prop = calcularProporcional(tblEstadia, movimento);
    valorProporcional = somaFixos + (prop.valor ?? 0);
    manual = prop.valor === null;
    pedeValor = !!prop.pedeValor;
    pontos = pontosServicos;
  } else if (doisSegmentos) {
    const tblOrig = tabelas[tipoVeic];
    if (!tblOrig) {
      throw new Error(`Tabela original não encontrada: "${tipoVeic}"`);
    }
    // Segmento 1: entrada → corte, na tabela do convênio (tbl).
    const seg1 = calcularProporcional(tbl, {
      dtEntrada: movimento.dtEntrada, entrada: movimento.entrada,
      dtSaida: movimento.dtSaida, saida: horaConvenio!,
    });
    // Segmento 2: corte → saída, na tabela original.
    const seg2 = calcularProporcional(tblOrig, {
      dtEntrada: movimento.dtEntrada, entrada: horaConvenio!,
      dtSaida: movimento.dtSaida, saida: movimento.saida,
    });
    valorProporcional = (seg1.valor ?? 0) + (seg2.valor ?? 0);
    // valor só é null quando estourou as faixas (sem pedeValor — esse caso
    // sempre devolve valor:0, nunca null, ver calcularProporcional).
    manual = seg1.valor === null || seg2.valor === null;
    pedeValor = !!(seg1.pedeValor || seg2.pedeValor);
    segmentos = [{ valor: seg1.valor ?? 0 }, { valor: seg2.valor ?? 0 }];
  } else {
    const prop = calcularProporcional(tbl, movimento);
    valorProporcional = prop.valor ?? 0;
    manual = prop.valor === null;
    pedeValor = !!prop.pedeValor;
  }

  // Convênio: desconto por grade própria (CON), percentual ou valor fixo.
  let valorConvenio = 0;
  if (convenio) {
    if (convenio.tabHoras) {
      // Grade própria: a coluna CON percorre as faixas com a MESMA regra da
      // HOR — numa faixa 'hora' ela soma por hora (CON=0 não acrescenta nada
      // ao valor achado até ali), numa faixa 'fixo' ela substitui o total.
      const fc = calcularValorFaixas(tbl.faixas, tempoDecorrido, 'con');
      valorConvenio = fc?.valor ?? 0;
    }
    if (convenio.perConv) {
      valorConvenio = (valorProporcional * convenio.perConv) / 100;
    }
    if (convenio.vlrConv) {
      valorConvenio = convenio.vlrConv;
    }
  }

  const valorSelos = selos * valorSelo;
  const valorVales = vales * valorVale;

  // Pipeline de ESTALAN2.PRG:550-555 (nesta ordem):
  //   valor = prop − convênio − selos − vales − (jáPago + bônus); piso 0; + dívida
  let valor = valorProporcional - valorConvenio - valorSelos - valorVales;
  valor = valor - (valorJaPago + bonusFidelidade);
  if (valor < 0) valor = 0;
  valor = valor + dividaAnterior;

  if (percFormaPagto) {
    // [VALIDAR] ponto exato de aplicação do ajuste por forma de pagamento.
    valor = valor * (1 + percFormaPagto / 100);
  }

  const centavos = (x: number): number => Math.round(x * 100) / 100;

  return {
    tempoDecorrido,
    valorProporcional: centavos(valorProporcional),
    valorConvenio: centavos(valorConvenio),
    valorSelos: centavos(valorSelos),
    valorVales: centavos(valorVales),
    valor: centavos(valor),
    pontos,
    manual,
    pedeValor,
    ...(segmentos ? { segmentos } : {}),
  };
}
