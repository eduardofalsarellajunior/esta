import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularSenhaMes, numeroClienteComoValor } from './senhaMes.js';

test('numeroClienteComoValor: dígitos viram número, texto inválido vira 0 (igual VAL() do Clipper)', () => {
  assert.equal(numeroClienteComoValor('7'), 7);
  assert.equal(numeroClienteComoValor('0007'), 7);
  assert.equal(numeroClienteComoValor(''), 0);
  assert.equal(numeroClienteComoValor(null), 0);
  assert.equal(numeroClienteComoValor(undefined), 0);
  assert.equal(numeroClienteComoValor('ABC'), 0);
});

test('calcularSenhaMes: mesma senha em qualquer dia do mesmo mês', () => {
  const a = calcularSenhaMes('7', new Date(2026, 7, 1));
  const b = calcularSenhaMes('7', new Date(2026, 7, 15));
  const c = calcularSenhaMes('7', new Date(2026, 7, 31));
  assert.equal(a, b);
  assert.equal(b, c);
});

test('calcularSenhaMes: muda de mês pra mês', () => {
  const ago = calcularSenhaMes('7', new Date(2026, 7, 15));
  const set = calcularSenhaMes('7', new Date(2026, 8, 1));
  assert.notEqual(ago, set);
});

test('calcularSenhaMes: muda de cliente pra cliente, no mesmo mês', () => {
  const cliente7 = calcularSenhaMes('7', new Date(2026, 7, 15));
  const cliente42 = calcularSenhaMes('42', new Date(2026, 7, 15));
  assert.notEqual(cliente7, cliente42);
});

test('calcularSenhaMes: sempre 5 letras maiúsculas A-Z', () => {
  const senha = calcularSenhaMes('123', new Date(2026, 7, 15));
  assert.match(senha, /^[A-Z]{5}$/);
});

test('calcularSenhaMes: "0007" e "7" dão a mesma senha (VAL() ignora zero à esquerda)', () => {
  const a = calcularSenhaMes('0007', new Date(2026, 7, 15));
  const b = calcularSenhaMes('7', new Date(2026, 7, 15));
  assert.equal(a, b);
});

// Valores travados a partir de uma conferência manual do algoritmo (soma
// ponderada mod 11 em cascata + embaralhamento dos 10 dígitos em pares) —
// ver packages/tarifacao/README.md ou o histórico de commit pra o rastreio
// completo. Servem de regressão; ainda não foram comparados com uma senha
// real emitida pelo sistema legado do Eduardo.
test('calcularSenhaMes: valores de referência (conferidos à mão)', () => {
  assert.equal(calcularSenhaMes('7', new Date(2026, 7, 15)), 'CHACR');
  assert.equal(calcularSenhaMes('', new Date(2026, 7, 15)), 'CHICR');
});
