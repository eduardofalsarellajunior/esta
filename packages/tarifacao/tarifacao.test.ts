import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  minuto,
  diffDias,
  horas,
  selecionaFaixa,
  calcularValorFaixas,
  calcularProporcional,
  calcularTarifa,
  type Faixa,
  type TabelaPreco,
} from './tarifacao.ts';

// Helpers -------------------------------------------------------------------
const f = (ate: number, hor: number, con = 0, tipoCobranca: 'fixo' | 'hora' | 'valor' = 'fixo', periodo?: number): Faixa =>
  ({ ate, hor, con, tipoCobranca, periodo });
const dia = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

/** Tabela G — AVULSO GRANDE. */
const G: TabelaPreco = {
  tipo: 'G',
  qtePontos: 0,
  faixas: [f(0.3, 7), f(1.05, 13), f(2.05, 17), f(3.05, 21), f(4.05, 25)],
};

/** Tabela P — AVULSO PEQUENO. */
const P: TabelaPreco = {
  tipo: 'P',
  qtePontos: 10,
  faixas: [f(0.3, 5, 3), f(4.0, 10, 6), f(13.0, 15, 9), f(14.0, 16, 10)],
};

const tabelas = { G, P };

// Primitivas ----------------------------------------------------------------
test('minuto: HH.MM -> minutos totais', () => {
  assert.equal(minuto(14.3), 870); // 14h30
  assert.equal(minuto(0.3), 30); // 30 min
  assert.equal(minuto(24.0), 1440);
});

test('diffDias', () => {
  assert.equal(diffDias(dia('2026-01-01'), dia('2026-01-01')), 0);
  assert.equal(diffDias(dia('2026-01-01'), dia('2026-01-03')), 2);
});

test('horas: tempo decorrido em HH.MM', () => {
  assert.equal(horas({ dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 }), 2.0);
  assert.equal(horas({ dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 10.2 }), 0.2);
  // vira o dia: 22h30 -> 06h15 = 7h45
  assert.equal(horas({ dtEntrada: dia('2026-01-01'), entrada: 22.3, dtSaida: dia('2026-01-02'), saida: 6.15 }), 7.45);
});

// Seleção de faixa ----------------------------------------------------------
test('selecionaFaixa: menor teto >= tempo', () => {
  assert.deepEqual(selecionaFaixa(G.faixas, 2.0), { valor: 17, indice: 3 });
  assert.deepEqual(selecionaFaixa(G.faixas, 0.3), { valor: 7, indice: 1 });
  assert.equal(selecionaFaixa(G.faixas, 99.0), null); // estoura as faixas
  assert.deepEqual(selecionaFaixa(P.faixas, 2.54, true), { valor: 6, indice: 2 }); // coluna CON
});

// Faixas fixo/hora ------------------------------------------------------------
// Exemplo exato validado com o Eduardo: até 0:30 fixo R$8; até 1:05 fixo R$10;
// até 12:05 hora R$5; até 99999:00 hora R$3.
const FAIXAS_MISTAS: Faixa[] = [
  f(0.3, 8, 0, 'fixo'),
  f(1.05, 10, 0, 'fixo'),
  f(12.05, 5, 0, 'hora'),
  f(99999.0, 3, 0, 'hora'),
];

test('faixas fixo/hora: 0:25 cai na 1ª faixa (fixo) = R$8', () => {
  assert.deepEqual(calcularValorFaixas(FAIXAS_MISTAS, 0.25), { valor: 8, indice: 1 });
});

test('faixas fixo/hora: 1:03 cai na 2ª faixa (fixo) = R$10 (não soma com a 1ª)', () => {
  assert.deepEqual(calcularValorFaixas(FAIXAS_MISTAS, 1.03), { valor: 10, indice: 2 });
});

test('faixas fixo/hora: 2:35 = R$10 (base) + 2h×R$5 (1:05→2:35 arred. pra cima) = R$20', () => {
  assert.deepEqual(calcularValorFaixas(FAIXAS_MISTAS, 2.35), { valor: 20, indice: 3 });
});

test('faixas fixo/hora: 15:20 = R$10 + 11h×R$5 (faixa 3 inteira) + 4h×R$3 (3:15 arred.) = R$77', () => {
  assert.deepEqual(calcularValorFaixas(FAIXAS_MISTAS, 15.2), { valor: 77, indice: 4 });
});

// Período configurável (faixa 'hora' sem ser necessariamente 1h) -------------
test('período ausente = 1h, igual ao comportamento de sempre', () => {
  // Mesma FAIXAS_MISTAS (sem periodo definido) — replica os dois casos acima
  // usando o valor default explicitamente, pra travar que "ausente" == "1h".
  const comPeriodoExplicito = [
    f(0.3, 8, 0, 'fixo'),
    f(1.05, 10, 0, 'fixo'),
    f(12.05, 5, 0, 'hora', 1.0),
    f(99999.0, 3, 0, 'hora', 1.0),
  ];
  assert.deepEqual(calcularValorFaixas(comPeriodoExplicito, 2.35), calcularValorFaixas(FAIXAS_MISTAS, 2.35));
  assert.deepEqual(calcularValorFaixas(comPeriodoExplicito, 15.2), calcularValorFaixas(FAIXAS_MISTAS, 15.2));
});

test('período de 30 minutos: cobra em blocos de 0:30, fração arredonda pra cima', () => {
  const faixas = [f(99999.0, 2, 0, 'hora', 0.3)]; // R$2 a cada 30min
  assert.deepEqual(calcularValorFaixas(faixas, 0.01), { valor: 2, indice: 1 }); // 1min -> 1 bloco
  assert.deepEqual(calcularValorFaixas(faixas, 0.30), { valor: 2, indice: 1 }); // exatos 30min -> 1 bloco
  assert.deepEqual(calcularValorFaixas(faixas, 0.31), { valor: 4, indice: 1 }); // 31min -> 2 blocos
  assert.deepEqual(calcularValorFaixas(faixas, 1.00), { valor: 4, indice: 1 }); // 60min -> 2 blocos
  assert.deepEqual(calcularValorFaixas(faixas, 1.01), { valor: 6, indice: 1 }); // 61min -> 3 blocos
});

test('período de 24 horas: cobra em diárias', () => {
  const faixas = [f(99999.0, 50, 0, 'hora', 24.0)]; // R$50 por diária de 24h
  assert.deepEqual(calcularValorFaixas(faixas, 20.0), { valor: 50, indice: 1 });  // 20h -> 1 diária
  assert.deepEqual(calcularValorFaixas(faixas, 24.0), { valor: 50, indice: 1 });  // exatas 24h -> 1 diária
  assert.deepEqual(calcularValorFaixas(faixas, 25.0), { valor: 100, indice: 1 }); // 25h -> 2 diárias
});

test('período também vale para a coluna CON (grade de convênio)', () => {
  const faixas = [f(99999.0, 10, 3, 'hora', 0.3)]; // cliente R$10/30min, convênio R$3/30min
  assert.deepEqual(calcularValorFaixas(faixas, 0.45, 'con'), { valor: 6, indice: 1 }); // 45min -> 2 blocos
});

// Faixa "valor" (pede o operador) --------------------------------------------
test('faixa "valor": é a faixa que bate -> pedeValor, sem tentar calcular', () => {
  const faixas = [f(1.0, 10), f(99999.0, 0, 0, 'valor')];
  assert.deepEqual(calcularValorFaixas(faixas, 3.0), { valor: 0, indice: 2, pedeValor: true });
});

test('faixa "valor": tempo passa por ela a caminho de uma faixa seguinte -> ainda pedeValor', () => {
  // Fixo até 1h, "valor" até 2h, fixo de novo até 3h — tempo cai na 3ª (2h30),
  // mas já atravessou a 2ª (valor) no caminho: não dá pra saber quanto ela
  // "contribuiu", então pede, não pula silenciosamente pra faixa seguinte.
  const faixas = [f(1.0, 10), f(2.0, 0, 0, 'valor'), f(3.0, 30)];
  assert.deepEqual(calcularValorFaixas(faixas, 2.3), { valor: 0, indice: 2, pedeValor: true });
});

test('faixa "valor" na coluna CON (grade de convênio): vale 0, não pede nada', () => {
  const faixas = [f(99999.0, 10, 0, 'valor')];
  assert.deepEqual(calcularValorFaixas(faixas, 1.0, 'con'), { valor: 0, indice: 1 });
});

test('calcularProporcional propaga pedeValor', () => {
  const tbl: TabelaPreco = { tipo: 'V', faixas: [f(99999.0, 0, 0, 'valor')] };
  const r = calcularProporcional(tbl, { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 });
  assert.equal(r.valor, 0);
  assert.equal(r.pedeValor, true);
});

test('calcularTarifa (caminho simples): pedeValor:true, valor 0, manual continua false', () => {
  const V: TabelaPreco = { tipo: 'V', faixas: [f(99999.0, 0, 0, 'valor')] };
  const r = calcularTarifa({
    tabelas: { V }, tipoVeic: 'V',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 },
  });
  assert.equal(r.valor, 0);
  assert.equal(r.pedeValor, true);
  assert.equal(r.manual, false); // motivo diferente de "estourou as faixas"
});

test('calcularTarifa: faixas normais continuam com pedeValor:false (mudança é aditiva)', () => {
  const r = calcularProporcional(G, { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 });
  assert.equal(r.pedeValor, undefined);
  const t = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 },
  });
  assert.equal(t.pedeValor, false);
});

test('calcularTarifa: pedeValor propaga da tabela usada pra estadia (1ª de servicosTipos)', () => {
  const V: TabelaPreco = { tipo: 'V', faixas: [f(99999.0, 0, 0, 'valor')] };
  const r = calcularTarifa({
    tabelas: { ...tabelas, V }, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 },
    servicosTipos: ['V', 'G'], // V é a 1ª — dela vem a estadia (e o pedeValor)
  });
  assert.equal(r.pedeValor, true);
});

test('calcularTarifa: pedeValor propaga pelos 2 segmentos (corte de convênio)', () => {
  const V: TabelaPreco = { tipo: 'V', faixas: [f(99999.0, 0, 0, 'valor')] };
  const r = calcularTarifa({
    tabelas: { ...tabelas, V }, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 16.0 },
    convenio: { codigo: 'X', tabConv: 'V' },
    horaConvenio: 13.0,
  });
  assert.equal(r.pedeValor, true); // seg1 (V) pede; seg2 (G) não precisa
});

// Proporcional (avulso) -----------------------------------------------------
test('proporcional G: 2h = R$17', () => {
  const r = calcularProporcional(G, { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 });
  assert.equal(r.valor, 17);
});

test('proporcional P: 2h54 = R$10', () => {
  const r = calcularProporcional(P, { dtEntrada: dia('2023-02-22'), entrada: 15.24, dtSaida: dia('2023-02-22'), saida: 18.18 });
  assert.equal(r.valor, 10);
});

// Serviços (valor fixo + estadia de uma só tabela) ---------------------------
test('servicosTipos: soma valorServico de G (R$8) + P (R$12) mais a estadia de G (R$17, 1ª da lista)', () => {
  const Gcv: TabelaPreco = { ...G, valorServico: 8 };
  const Pcv: TabelaPreco = { ...P, valorServico: 12 };
  const r = calcularTarifa({
    tabelas: { G: Gcv, P: Pcv }, tipoVeic: 'G', // ignorado — servicosTipos manda
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 },
    servicosTipos: ['G', 'P'],
  });
  // Fixo: 8 (G) + 12 (P) = 20. Estadia: faixas de G (2h = R$17) só uma vez —
  // não soma a de P de novo, é a mesma permanência real.
  assert.equal(r.valorProporcional, 37);
  assert.equal(r.valor, 37);
  assert.equal(r.manual, false);
  // Pontos são a soma das tabelas dos serviços (G=0 + P=10), não da tabela
  // do veículo (ver teste seguinte pra isolar isso melhor).
  assert.equal(r.pontos, 10);
});

test('servicosTipos: pontos vêm das tabelas dos serviços, não da tabela do veículo', () => {
  // Regressão: um cliente que só usa lava-rápido (cobrado por serviço, não
  // pela tabela de entrada do carro) nunca acumulava ponto nenhum, porque o
  // motor sempre devolvia os pontos da tabela do VEÍCULO — mesmo ela não
  // tendo nada a ver com a cobrança real da saída.
  const tabelasComVeiculoDePontos = { ...tabelas, V: { tipo: 'V', qtePontos: 999, faixas: G.faixas } };
  const r = calcularTarifa({
    tabelas: tabelasComVeiculoDePontos, tipoVeic: 'V', // 999 pontos — não deve aparecer no resultado
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 },
    servicosTipos: ['P'], // 10 pontos
  });
  assert.equal(r.pontos, 10);
});

// Convênio ------------------------------------------------------------------
test('convênio percentual (50%): prop 17 -> desconto 8,50 -> cobra 8,50', () => {
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 },
    convenio: { codigo: 'X', perConv: 50 },
  });
  assert.equal(r.valorProporcional, 17);
  assert.equal(r.valorConvenio, 8.5);
  assert.equal(r.valor, 8.5);
});

test('convênio valor fixo (VLRCONV) sobrepõe', () => {
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 },
    convenio: { codigo: 'X', perConv: 50, vlrConv: 8 },
  });
  assert.equal(r.valorConvenio, 8);
  assert.equal(r.valor, 9);
});

test('convênio troca de tabela (TABCONV): G roteado para P', () => {
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2023-02-22'), entrada: 15.24, dtSaida: dia('2023-02-22'), saida: 18.18 },
    convenio: { codigo: 'X', tabConv: 'P' },
  });
  assert.equal(r.valorProporcional, 10); // usou a tabela P
});

test('convênio por grade própria (TABHORAS/CON): usa coluna CON', () => {
  const r = calcularTarifa({
    tabelas, tipoVeic: 'P',
    movimento: { dtEntrada: dia('2023-02-22'), entrada: 15.24, dtSaida: dia('2023-02-22'), saida: 18.18 },
    convenio: { codigo: 'X', tabHoras: true },
  });
  assert.equal(r.valorProporcional, 10);
  assert.equal(r.valorConvenio, 6); // CON da faixa 2
  assert.equal(r.valor, 4);
});

// Grade própria com faixa por hora: a coluna CON acumula igual à HOR — CON
// zerado numa faixa 'hora' não acrescenta nada ao valor achado até ali.
const TH: TabelaPreco = {
  tipo: 'TH',
  faixas: [f(1.0, 10, 10), f(5.0, 2, 1, 'hora'), f(12.0, 3, 0, 'hora')],
};

test('grade própria: coluna CON soma por hora nas faixas "hora"', () => {
  const r = calcularTarifa({
    tabelas: { ...tabelas, TH },
    tipoVeic: 'TH',
    // 3h: faixa 1 (fixo 10/10) + 2h da faixa 2 (2/h e 1/h) = 14 e 12.
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 13.0 },
    convenio: { codigo: 'X', tabHoras: true },
  });
  assert.equal(r.valorProporcional, 14);
  assert.equal(r.valorConvenio, 12);
  assert.equal(r.valor, 2);
});

test('grade própria: CON zerado em faixa "hora" mantém o valor achado antes', () => {
  const r = calcularTarifa({
    tabelas: { ...tabelas, TH },
    tipoVeic: 'TH',
    // 6h: faixa 1 (10/10) + 4h da faixa 2 (8/4) + 1h da faixa 3 (3/0).
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 16.0 },
    convenio: { codigo: 'X', tabHoras: true },
  });
  assert.equal(r.valorProporcional, 21);
  assert.equal(r.valorConvenio, 14); // a faixa 3 não acrescentou nada
  assert.equal(r.valor, 7);
});

test('piso em zero: convênio maior que o valor', () => {
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 },
    convenio: { codigo: 'X', vlrConv: 100 },
  });
  assert.equal(r.valor, 0);
});

test('ajuste por forma de pagamento (+10%)', () => {
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 },
    percFormaPagto: 10,
  });
  assert.equal(r.valor, 18.7);
});

test('pontos de fidelidade vêm da tabela', () => {
  const r = calcularTarifa({
    tabelas, tipoVeic: 'P',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 },
  });
  assert.equal(r.pontos, 10);
});

// --- Regras adicionais (motor completo) ---

test('convênio em 2 segmentos (hora de corte): P até 13h + G depois', () => {
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 16.0 },
    convenio: { codigo: 'X', tabConv: 'P' },
    horaConvenio: 13.0,
  });
  // seg1 (P 10h->13h) = R$10 ; seg2 (G 13h->16h) = R$21 ; total = R$31
  assert.equal(r.valorProporcional, 31);
  assert.equal(r.valor, 31);
  assert.equal(r.segmentos?.length, 2);
  assert.equal(r.segmentos?.[0]?.valor, 10);
  assert.equal(r.segmentos?.[1]?.valor, 21);
});

test('corte de convênio: 100% banca só até o corte, o passeio depois é do cliente', () => {
  // Caso real: cliente vai ao cabeleireiro (convênio paga 100%), fica 1h15 e
  // depois passeia pela cidade até as 16h. O convênio paga a estadia dele; as
  // horas de passeio saem pela tabela do convênio (tabPreco = P).
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 16.0 },
    convenio: { codigo: 'CABELO', perConv: 100, tabPreco: 'P' },
    horaConvenio: 11.15,
  });
  // seg1 (G 10h->11h15) = R$17 ; seg2 (P 11h15->16h = 4h45) = R$15
  assert.equal(r.segmentos?.[0]?.valor, 17);
  assert.equal(r.segmentos?.[1]?.valor, 15);
  assert.equal(r.valorProporcional, 32);
  // 100% de desconto, mas SÓ sobre o trecho do convênio.
  assert.equal(r.valorConvenio, 17);
  assert.equal(r.valor, 15);
});

test('corte de convênio: sem hora de corte, os 100% cobrem a estadia inteira', () => {
  // Mesmo convênio, mas o cliente saiu direto do cabeleireiro pro portão —
  // sem corte não há segundo trecho, e aí o convênio banca tudo (é o
  // comportamento de sempre, não pode ter mudado).
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 16.0 },
    convenio: { codigo: 'CABELO', perConv: 100, tabPreco: 'P' },
  });
  assert.equal(r.segmentos, undefined);
  assert.equal(r.valorConvenio, r.valorProporcional);
  assert.equal(r.valor, 0);
});

test('corte de convênio: dispensa tabConv (convênio sem tabela própria também divide)', () => {
  // Antes o corte só valia com `tabConv` preenchido — um convênio que só dá
  // desconto (sem tabela própria) nunca se dividia, e o passeio depois saía
  // no mesmo desconto.
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 14.0 },
    convenio: { codigo: 'X', perConv: 50 },
    horaConvenio: 11.15,
  });
  assert.equal(r.segmentos?.length, 2);
  // Sem tabPreco, o trecho de depois cai na tabela do próprio veículo (G).
  // seg1 (G 1h15) = R$17 ; seg2 (G 11h15->14h = 2h45) = R$21
  assert.equal(r.segmentos?.[0]?.valor, 17);
  assert.equal(r.segmentos?.[1]?.valor, 21);
  // 50% de 17 (só o trecho do convênio), não de 38.
  assert.equal(r.valorConvenio, 8.5);
  assert.equal(r.valor, 29.5);
});

test('corte de convênio: o 2º período começa no minuto SEGUINTE ao corte', () => {
  // Exemplo do Eduardo: entra 13h, sai do convênio 13h30, sai do pátio 14h30.
  // Período 1 = 13h00–13h30; período 2 = 13h31–14h30, ou seja 59 min (não 60).
  // A tabela BORDA vira de faixa exatamente em 0.59 pra diferença aparecer:
  // com 59 min cai na de R$ 5; contíguo (60 min) cairia na de R$ 20.
  const BORDA: TabelaPreco = { tipo: 'BORDA', faixas: [f(0.59, 5), f(4.0, 20)] };
  const r = calcularTarifa({
    tabelas: { ...tabelas, BORDA }, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 13.0, dtSaida: dia('2026-01-01'), saida: 14.3 },
    convenio: { codigo: 'CABELO', perConv: 100, tabPreco: 'BORDA' },
    horaConvenio: 13.3,
  });
  assert.equal(r.segmentos?.[1]?.valor, 5);
  // Convênio banca os 30 min iniciais; o cliente paga só os 59 min de passeio.
  assert.equal(r.valor, 5);
});

test('corte de convênio: minuto seguinte vira a hora certo (13.59 -> 14.00)', () => {
  // 13.59 + 1 min não pode virar "13.60" — a hora comercial não tem isso.
  const BORDA: TabelaPreco = { tipo: 'BORDA', faixas: [f(1.0, 5), f(4.0, 20)] };
  const r = calcularTarifa({
    tabelas: { ...tabelas, BORDA }, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 13.0, dtSaida: dia('2026-01-01'), saida: 15.0 },
    convenio: { codigo: 'X', perConv: 100, tabPreco: 'BORDA' },
    horaConvenio: 13.59,
  });
  // 2º período = 14h00 -> 15h00 = 1h exata -> faixa de R$ 5 (se tivesse
  // virado 13.60, minuto() leria 13h60 e daria 1 minuto a menos).
  assert.equal(r.segmentos?.[1]?.valor, 5);
});

test('corte de convênio: saiu do convênio no minuto da saída -> sem 2º período', () => {
  // A saída sugere a hora de AGORA no campo; se o operador aceitar, o 2º
  // período começaria DEPOIS da saída (13.30 + 1 min = 13.31 > 13.30). Sem a
  // guarda, esse trecho de duração negativa ainda cairia na 1ª faixa e
  // cobraria uma estadia que não existiu.
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 13.3 },
    convenio: { codigo: 'CABELO', perConv: 100, tabPreco: 'P' },
    horaConvenio: 13.29, // um minuto antes da saída: 2º período começaria em 13.30
  });
  assert.equal(r.segmentos?.[1]?.valor, 0);
  assert.equal(r.valor, 0); // convênio de 100% cobre tudo, nada sobra pro cliente
});

test('corte de convênio: valor fixo não pode bancar mais que o próprio trecho', () => {
  // Convênio paga R$ 50 fixos, mas o trecho dele só custou R$ 17 — o troco
  // não pode virar desconto no passeio que o cliente fez depois.
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 16.0 },
    convenio: { codigo: 'X', vlrConv: 50, tabPreco: 'P' },
    horaConvenio: 11.15,
  });
  assert.equal(r.valorConvenio, 17); // limitado ao seg1, não os R$ 50
  assert.equal(r.valor, 15); // o cliente paga o passeio inteiro
});

test('selos abatem do valor', () => {
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 },
    selos: 2, valorSelo: 5,
  });
  assert.equal(r.valorSelos, 10);
  assert.equal(r.valor, 7); // prop 17 - 10
});

test('vales abatem do valor', () => {
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 },
    vales: 1, valorVale: 5,
  });
  assert.equal(r.valorVales, 5);
  assert.equal(r.valor, 12);
});

test('saldo devedor anterior é somado após o piso', () => {
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 },
    dividaAnterior: 7,
  });
  assert.equal(r.valor, 24); // 17 + 7
});

test('já pago + bônus de fidelidade abatem antes do piso', () => {
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 },
    valorJaPago: 10, bonusFidelidade: 3,
  });
  assert.equal(r.valor, 4); // 17 - 13
});

test('ordem correta: piso zerado ANTES de somar a dívida', () => {
  const r = calcularTarifa({
    tabelas, tipoVeic: 'G',
    movimento: { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 },
    convenio: { codigo: 'X', vlrConv: 100 }, // zera o valor
    dividaAnterior: 5,
  });
  assert.equal(r.valor, 5); // (17 - 100 -> 0) + 5
});
