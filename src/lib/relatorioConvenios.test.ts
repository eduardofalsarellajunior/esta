import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparPorConvenio, gruposDeConvenios } from './relatorioConvenios.js';

/** Convênios do exemplo: C1/C2/C3 no grupo "C", e um avulso sem grupo. */
const CONVENIOS = {
  C1: { razao: 'Loja Centro', grupo: 'C' },
  C2: { razao: 'Loja Norte', grupo: 'C' },
  C3: { razao: 'Loja Sul', grupo: 'C' },
  X9: { razao: 'Padaria', grupo: '' },
};

const mov = (codigo: string, valor: number) => ({ convenio_codigo: codigo, valor_convenio: valor });

test('agrupa por grupo e por código, com subtotal de cada código e total do grupo', () => {
  const r = agruparPorConvenio(
    [mov('C1', 10), mov('C2', 20), mov('C1', 5), mov('C3', 7)],
    CONVENIOS,
  );
  assert.equal(r.grupos.length, 1);
  const grupoC = r.grupos[0];
  assert.equal(grupoC.grupo, 'C');
  assert.deepEqual(grupoC.convenios.map((c) => c.codigo), ['C1', 'C2', 'C3']);
  // Subtotal de cada código.
  assert.deepEqual(grupoC.convenios.map((c) => c.total), [15, 20, 7]);
  assert.deepEqual(grupoC.convenios.map((c) => c.qtde), [2, 1, 1]);
  // Total do grupo = soma dos 3 códigos.
  assert.equal(grupoC.total, 42);
  assert.equal(grupoC.qtde, 4);
  assert.equal(r.total, 42);
});

test('convênio sem grupo vai pro bloco vazio, que fica sempre por último', () => {
  const r = agruparPorConvenio([mov('X9', 3), mov('C1', 10)], CONVENIOS);
  assert.deepEqual(r.grupos.map((g) => g.grupo), ['C', '']);
  assert.equal(r.grupos[1].convenios[0].codigo, 'X9');
  assert.equal(r.total, 13);
});

test('grupos saem em ordem alfabética', () => {
  const convenios = { A1: { grupo: 'Z' }, B1: { grupo: 'A' }, C1: { grupo: 'M' } };
  const r = agruparPorConvenio([mov('A1', 1), mov('B1', 1), mov('C1', 1)], convenios);
  assert.deepEqual(r.grupos.map((g) => g.grupo), ['A', 'M', 'Z']);
});

test('estadia sem desconto de convênio entra na listagem contando zero', () => {
  // O convênio pode não ter bancado nada (cadastro sem desconto, ou a saída
  // caiu fora da regra) — a estadia ainda é do convênio e precisa aparecer.
  const r = agruparPorConvenio([mov('C1', 0), mov('C1', 10)], CONVENIOS);
  assert.equal(r.grupos[0].convenios[0].qtde, 2);
  assert.equal(r.grupos[0].convenios[0].total, 10);
});

test('somas não acumulam sobra de ponto flutuante', () => {
  // 0.1 + 0.2 = 0.30000000000000004 — sem arredondar, o total do grupo
  // apareceria com uma dízima no relatório impresso.
  const r = agruparPorConvenio([mov('C1', 0.1), mov('C2', 0.2)], CONVENIOS);
  assert.equal(r.grupos[0].total, 0.3);
  assert.equal(r.total, 0.3);
});

test('convênio que não está no cadastro não derruba o relatório', () => {
  // Movimento antigo cujo convênio foi excluído do cadastro depois.
  const r = agruparPorConvenio([mov('SUMIU', 5)], CONVENIOS);
  assert.equal(r.grupos[0].grupo, '');
  assert.equal(r.grupos[0].convenios[0].codigo, 'SUMIU');
  assert.equal(r.total, 5);
});

test('gruposDeConvenios: distintos, sem vazios, em ordem', () => {
  assert.deepEqual(
    gruposDeConvenios([{ grupo: 'C' }, { grupo: '' }, { grupo: 'A' }, { grupo: 'C' }, {}]),
    ['A', 'C'],
  );
});
