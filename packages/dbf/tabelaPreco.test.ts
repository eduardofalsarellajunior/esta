import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectarColunasFaixa, detectarTabelasPreco } from './tabelaPreco.ts';

test('detectarColunasFaixa: acha ATE/HOR/CON com zero à esquerda, ordenado', () => {
  const nomes = ['TIPO', 'ATE02', 'HOR02', 'CON02', 'ATE01', 'HOR01', 'CON01', 'DESCRICAO'];
  const grupos = detectarColunasFaixa(nomes);
  assert.deepEqual(grupos.map((g) => g.ordem), [1, 2]);
  assert.equal(grupos[0].ate, 'ATE01');
  assert.equal(grupos[0].hor, 'HOR01');
  assert.equal(grupos[0].con, 'CON01');
});

test('detectarColunasFaixa: aceita sem zero à esquerda e ignora ordem > 45', () => {
  const nomes = ['ATE1', 'HOR1', 'ATE46', 'HOR46'];
  const grupos = detectarColunasFaixa(nomes);
  assert.deepEqual(grupos.map((g) => g.ordem), [1]);
});

test('detectarColunasFaixa: faixa sem HOR correspondente é ignorada (grupo incompleto)', () => {
  const nomes = ['ATE01', 'HOR01', 'ATE02']; // sem HOR02
  const grupos = detectarColunasFaixa(nomes);
  assert.deepEqual(grupos.map((g) => g.ordem), [1]);
});

test('detectarColunasFaixa: CON é opcional', () => {
  const nomes = ['ATE01', 'HOR01'];
  const grupos = detectarColunasFaixa(nomes);
  assert.equal(grupos[0].con, null);
});

test('detectarTabelasPreco: monta tabela com faixas, pulando as não usadas (ATE zerado)', () => {
  const nomes = ['TIPO', 'DESCRICAO', 'VALORANTES', 'VALORSERV', 'QTEPONTOS', 'ATE01', 'HOR01', 'CON01', 'ATE02', 'HOR02', 'CON02'];
  const registros = [
    { TIPO: 'P', DESCRICAO: 'Avulso Pequeno', VALORANTES: 5, VALORSERV: 12, QTEPONTOS: 1, ATE01: 1.0, HOR01: 10, CON01: 8, ATE02: 0, HOR02: 0, CON02: 0 },
  ];
  const { tabelas } = detectarTabelasPreco(nomes, registros);
  assert.equal(tabelas.length, 1);
  assert.equal(tabelas[0].tipo, 'P');
  assert.equal(tabelas[0].descricao, 'Avulso Pequeno');
  assert.equal(tabelas[0].valorAntes, 5);
  assert.equal(tabelas[0].valorServico, 12);
  assert.equal(tabelas[0].qtePontos, 1);
  assert.equal(tabelas[0].faixas.length, 1); // ATE02 zerado -> não vira faixa
  assert.deepEqual(tabelas[0].faixas[0], { ordem: 1, ate: 1.0, valorHora: 10, valorConvenio: 8 });
});

test('detectarTabelasPreco: linha sem TIPO é descartada', () => {
  const nomes = ['TIPO', 'ATE01', 'HOR01'];
  const registros = [{ TIPO: '', ATE01: 1, HOR01: 10 }, { TIPO: 'G', ATE01: 1, HOR01: 10 }];
  const { tabelas } = detectarTabelasPreco(nomes, registros);
  assert.equal(tabelas.length, 1);
  assert.equal(tabelas[0].tipo, 'G');
});

test('detectarTabelasPreco: reindexa a ordem das faixas sem "buraco" quando uma faixa do meio não é usada', () => {
  const nomes = ['TIPO', 'ATE01', 'HOR01', 'ATE02', 'HOR02', 'ATE03', 'HOR03'];
  const registros = [{ TIPO: 'M', ATE01: 1, HOR01: 5, ATE02: 0, HOR02: 0, ATE03: 3, HOR03: 15 }];
  const { tabelas } = detectarTabelasPreco(nomes, registros);
  assert.deepEqual(tabelas[0].faixas.map((f) => f.ordem), [1, 2]);
  assert.equal(tabelas[0].faixas[1].ate, 3);
});
