import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  minuto,
  diffDias,
  horas,
  pernoite,
  selecionaFaixa,
  calcularValorFaixas,
  calcularProporcional,
  calcularTarifa,
  type Faixa,
  type TabelaPreco,
  type Movimento,
} from './tarifacao.ts';

// Helpers -------------------------------------------------------------------
const f = (ate: number, hor: number, con = 0, tipoCobranca: 'fixo' | 'hora' = 'fixo'): Faixa =>
  ({ ate, hor, con, tipoCobranca });
const dia = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

/** Tabela G — AVULSO GRANDE, sem pernoite. */
const G: TabelaPreco = {
  tipo: 'G',
  ePernoite: 0,
  sPernoite: 0,
  vPernoite: 0,
  tol: 0,
  qtePontos: 0,
  faixas: [f(0.3, 7), f(1.05, 13), f(2.05, 17), f(3.05, 21), f(4.05, 25)],
};

/** Tabela P — AVULSO PEQUENO, com pernoite (18h→5h, diária 50, tol 99%). */
const P: TabelaPreco = {
  tipo: 'P',
  ePernoite: 18.0,
  sPernoite: 5.0,
  vPernoite: 50,
  tol: 99,
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

// Proporcional (avulso) -----------------------------------------------------
test('proporcional G: 2h = R$17', () => {
  const r = calcularProporcional(G, { dtEntrada: dia('2026-01-01'), entrada: 10.0, dtSaida: dia('2026-01-01'), saida: 12.0 });
  assert.equal(r.valor, 17);
  assert.equal(r.diarias, 0);
});

test('proporcional P diurno: residual 2h54 = R$10 (sem diária)', () => {
  const r = calcularProporcional(P, { dtEntrada: dia('2023-02-22'), entrada: 15.24, dtSaida: dia('2023-02-22'), saida: 18.18 });
  assert.equal(r.diarias, 0);
  assert.equal(r.residual, 2.54);
  assert.equal(r.valor, 10);
});

// Pernoite ([VALIDAR] resolvido) --------------------------------------------
test('pernoite P: 20h00 -> dia seguinte 08h00 = 1 diária + residual 3h00', () => {
  const mov: Movimento = { dtEntrada: dia('2026-01-01'), entrada: 20.0, dtSaida: dia('2026-01-02'), saida: 8.0 };
  const p = pernoite(mov, P);
  assert.equal(p.diarias, 1);
  assert.equal(p.residual, 3.0);
  const r = calcularProporcional(P, mov);
  // faixa(3.00) = R$10  +  1 diária × R$50 = R$60
  assert.equal(r.valor, 60);
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
