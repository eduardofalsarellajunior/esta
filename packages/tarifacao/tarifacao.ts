/**
 * Motor de tarifação — réplica fiel da lógica do legado Clipper (HESTA).
 *
 * Fontes portados:
 *  - `SISPROC2.PRG`  → FUNCTION HORAS / PERNOITE / MINUTO
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
  /** Valor quando a tabela é usada como grade de convênio (coluna CON). Sempre um valor fixo (ver `calcularValorFaixas`). */
  con: number;
  /**
   * 'fixo': `hor` é o valor cheio da faixa (substitui o total acumulado até aqui).
   * 'hora': `hor` é uma taxa por hora, somada cumulativamente a partir do teto
   * da faixa anterior, com fração de hora arredondada pra cima.
   */
  tipoCobranca: 'fixo' | 'hora';
}

export interface TabelaPreco {
  /** Código da tabela (ex.: "P", "G", "M", "D"). */
  tipo: string;
  /** Início da janela de pernoite/diária, HH.MM (0 = sem pernoite). */
  ePernoite: HoraComercial;
  /** Fim da janela de pernoite/diária, HH.MM. */
  sPernoite: HoraComercial;
  /** Valor de cada diária/pernoite. */
  vPernoite: number;
  /** Tolerância PERCENTUAL da janela de pernoite (0–100). Ver PERNOITE. */
  tol: number;
  /** Pontos de fidelidade concedidos (QTEPONTOS). */
  qtePontos?: number;
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
  /** Nº de diárias/pernoites contabilizadas. */
  diarias: number;
  /** Tempo residual (fora das janelas de pernoite), em HH.MM. */
  residual: HoraComercial;
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
  /** Detalhe dos segmentos, quando a cobrança é em 2 partes (corte de convênio). */
  segmentos?: Array<{ valor: number; diarias: number; residual: HoraComercial }>;
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

/** Chave comparável (dia + HH.MM) para o laço de pernoite. */
function chave(dia: number, hhmm: HoraComercial): number {
  return dia * 100_000 + Math.round(hhmm * 100);
}

/** Re-encoda minutos totais em HH.MM (parte decimal = minutos). */
export function minutosParaHHMM(min: number): HoraComercial {
  const hh = Math.trunc(min / 60);
  const mm = min - hh * 60;
  return hh + mm / 100;
}

export interface Pernoite {
  diarias: number;
  residual: HoraComercial;
}

/**
 * Réplica de FUNCTION PERNOITE. Devolve nº de diárias e o tempo residual.
 * `tol` é PERCENTUAL: exige-se ocupar ao menos (janela × (100−tol)/100) para
 * contabilizar uma diária. Confirmado nos dados reais (tabela "P" tem TOL=99).
 */
export function pernoite(mov: Movimento, tbl: TabelaPreco): Pernoite {
  const { ePernoite: fpe, sPernoite: fps, tol } = tbl;

  // Sem janela de pernoite definida: só tempo corrido (0 diárias).
  if (fpe === 0 && fps === 0 && tol === 0) {
    return { diarias: 0, residual: horas(mov) };
  }

  const y = ((24 * 60 - minuto(fpe) + minuto(fps)) * (100 - tol)) / 100;

  let de = 0; // dia da entrada relativo
  const se = diffDias(mov.dtEntrada, mov.dtSaida); // dia da saída relativo
  let pe = de; // âncora da janela (acompanha `de`)
  let fentrada = mov.entrada;
  const sai = mov.saida;

  let horasMin = 0;
  let diarias = 0;

  // Trava de segurança (estadias absurdas em dados históricos ruins).
  let guarda = 0;
  while (guarda++ < 10_000) {
    const fie = chave(de, fentrada);
    const fip = chave(pe, fpe);
    const ffp = chave(pe + 1, fps);
    const fis = chave(se, sai);

    if (fie < fip) {
      if (de === se) {
        horasMin += minuto(sai) - minuto(fentrada);
        break;
      }
      horasMin += minuto(fpe) - minuto(fentrada);
      fentrada = fpe;
      continue;
    }
    if (fis <= ffp) {
      const x = 24 * 60 - minuto(fentrada) + minuto(sai);
      if (x >= y) {
        diarias += 1;
      } else {
        horasMin += x;
      }
      break;
    }
    diarias += 1;
    if (de + 1 === se) {
      horasMin += minuto(sai) - minuto(fps);
      break;
    }
    de += 1;
    pe = de;
    fentrada = fps;
  }

  return { diarias, residual: minutosParaHHMM(horasMin) };
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
 *  - Faixa 'hora': soma ao total `horas × hor`, onde `horas` é o tempo entre
 *    a fronteira e (o tempo, se cai nesta faixa; senão o teto desta faixa),
 *    sempre arredondado pra cima (fração de hora conta como 1h).
 * A fronteira avança para o teto da faixa a cada passo, fixo ou hora.
 * Retorna null se o tempo estourar todas as faixas (igual antes).
 */
export function calcularValorFaixas(
  faixas: Faixa[],
  tempo: HoraComercial,
): { valor: number; indice: number } | null {
  const alvo = Math.round(tempo * 100);
  let fronteira: HoraComercial = 0;
  let total = 0;
  for (let i = 0; i < faixas.length; i++) {
    const f = faixas[i]!;
    const dentro = alvo <= Math.round(f.ate * 100);
    if (f.tipoCobranca === 'hora') {
      const fimBloco = dentro ? tempo : f.ate;
      const horas = Math.ceil((minuto(fimBloco) - minuto(fronteira)) / 60);
      total += horas * f.hor;
    } else {
      total = f.hor;
    }
    if (dentro) return { valor: total, indice: i + 1 };
    fronteira = f.ate;
  }
  return null;
}

/**
 * Valor proporcional (de tabela, pré-convênio): faixa do tempo residual mais
 * as diárias. Réplica do trecho avulso de ESTALAN2.PRG (linhas 443-472).
 */
export function calcularProporcional(
  tbl: TabelaPreco,
  mov: Movimento,
): { valor: number | null; diarias: number; residual: HoraComercial } {
  const { diarias, residual } = pernoite(mov, tbl);
  const faixa = calcularValorFaixas(tbl.faixas, residual);
  if (faixa === null) {
    return { valor: null, diarias, residual };
  }
  return { valor: faixa.valor + diarias * tbl.vPernoite, diarias, residual };
}

/**
 * Cálculo completo da tarifa de saída (avulso + convênio simples).
 *
 * Cobertura atual: proporcional (faixas + pernoite), convênio por tabela
 * alternativa (TABCONV), por grade própria (TABHORAS/CON), percentual
 * (PERCONV) e valor fixo (VLRCONV), piso em zero, pontos e ajuste por forma
 * de pagamento. NÃO cobre ainda: corte de convênio em 2 segmentos, selos/
 * vales, saldo devedor e bônus de fidelidade (ver README).
 */
export function calcularTarifa(input: EntradaCalculo): ResultadoTarifa {
  const {
    tabelas, tipoVeic, movimento, convenio, horaConvenio,
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
  let diarias: number;
  let residual: HoraComercial;
  let manual: boolean;
  let segmentos: ResultadoTarifa['segmentos'];

  // Cobrança em DOIS segmentos: convênio com hora de corte + tabela original.
  const doisSegmentos =
    convenio?.tabConv != null &&
    horaConvenio != null &&
    horaConvenio !== movimento.saida;

  if (doisSegmentos) {
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
    // [VALIDAR] no legado, a janela de pernoite do seg.2 usa parâmetros da
    // tabela do convênio; aqui usamos a própria tabela original (mais simples).
    const seg2 = calcularProporcional(tblOrig, {
      dtEntrada: movimento.dtEntrada, entrada: horaConvenio!,
      dtSaida: movimento.dtSaida, saida: movimento.saida,
    });
    valorProporcional = (seg1.valor ?? 0) + (seg2.valor ?? 0);
    diarias = seg1.diarias + seg2.diarias;
    residual = seg2.residual;
    manual = seg1.valor === null || seg2.valor === null;
    segmentos = [
      { valor: seg1.valor ?? 0, diarias: seg1.diarias, residual: seg1.residual },
      { valor: seg2.valor ?? 0, diarias: seg2.diarias, residual: seg2.residual },
    ];
  } else {
    const prop = calcularProporcional(tbl, movimento);
    valorProporcional = prop.valor ?? 0;
    diarias = prop.diarias;
    residual = prop.residual;
    manual = prop.valor === null;
  }

  // Convênio: desconto por grade própria (CON), percentual ou valor fixo.
  let valorConvenio = 0;
  if (convenio) {
    if (convenio.tabHoras) {
      // [VALIDAR] usaValorConvenioDaFaixa: coluna CON como valor de convênio.
      const fc = selecionaFaixa(tbl.faixas, residual, true);
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
    diarias,
    residual,
    valorProporcional: centavos(valorProporcional),
    valorConvenio: centavos(valorConvenio),
    valorSelos: centavos(valorSelos),
    valorVales: centavos(valorVales),
    valor: centavos(valor),
    pontos: tbl.qtePontos ?? 0,
    manual,
    ...(segmentos ? { segmentos } : {}),
  };
}
