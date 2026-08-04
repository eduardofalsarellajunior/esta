import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sugerirMapeamento, converterLinha, paraBool, paraNumero, paraTexto, paraData, DESTINOS } from './mapeamento.ts';

test('sugerirMapeamento: acha o campo do dbf por palpite, case-insensitive', () => {
  const colunas = DESTINOS.modelos_veiculo.colunas;
  const mapa = sugerirMapeamento(colunas, ['codigo', 'Carro', 'TABELA', 'OUTRACOISA']);
  assert.equal(mapa.codigo, 'codigo');
  assert.equal(mapa.nome, 'Carro');
  assert.equal(mapa.tabela_tipo, 'TABELA');
});

test('sugerirMapeamento: sem campo correspondente -> null (não trava, fica pra revisão manual)', () => {
  const colunas = DESTINOS.modelos_veiculo.colunas;
  const mapa = sugerirMapeamento(colunas, ['XCODIGO']);
  assert.equal(mapa.codigo, null);
  assert.equal(mapa.nome, null);
});

test('paraBool: aceita S/N, T/F, boolean já pronto e ignora o resto', () => {
  assert.equal(paraBool('S'), true);
  assert.equal(paraBool('n'), false);
  assert.equal(paraBool(true), true);
  assert.equal(paraBool(false), false);
  assert.equal(paraBool(' '), null);
  assert.equal(paraBool(null), null);
});

test('paraNumero: string com espaços, número já pronto, vazio -> null', () => {
  assert.equal(paraNumero(' 10 '), 10);
  assert.equal(paraNumero(30), 30);
  assert.equal(paraNumero(''), null);
  assert.equal(paraNumero('abc'), null);
});

test('paraTexto: trim e vazio -> null', () => {
  assert.equal(paraTexto('  Fulano  '), 'Fulano');
  assert.equal(paraTexto('   '), null);
  assert.equal(paraTexto(null), null);
});

test('paraData: só aceita ISO já pronto (como o lerDbf devolve pra campo tipo D) — resto vira null, não grava data inválida', () => {
  assert.equal(paraData('2026-08-10'), '2026-08-10');
  assert.equal(paraData(10), null); // ex.: mapeou por engano um campo numérico (dia isolado, sem mês/ano)
  assert.equal(paraData('10'), null);
  assert.equal(paraData(null), null);
});

test('converterLinha: valor da mensalidade e próximo pagamento (campos antes fora do mapeamento)', () => {
  const colunas = DESTINOS.mensalistas.colunas;
  const mapeamento = sugerirMapeamento(colunas, ['NOMECAR', 'RAZAO', 'VALOR', 'DIA']);
  // DIA aqui simula um campo tipo D do dbf, já normalizado pelo lerDbf pra ISO.
  const linha = converterLinha({ NOMECAR: '12', RAZAO: 'Fulano', VALOR: 250.5, DIA: '2026-08-10' }, colunas, mapeamento);
  assert.equal(linha.valor_mensalidade, 250.5);
  assert.equal(linha.proximo_pagamento, '2026-08-10');
});

test('converterLinha: aplica mapeamento, tipos e valor padrão (coluna NOT NULL sem valor no dbf)', () => {
  const colunas = DESTINOS.mensalistas.colunas;
  const mapeamento = sugerirMapeamento(colunas, ['NOMECAR', 'RAZAO', 'QTEVAGAS']);
  const linha = converterLinha({ NOMECAR: '12', RAZAO: 'Fulano de Tal', QTEVAGAS: 2 }, colunas, mapeamento);
  assert.equal(linha.codigo, '12');
  assert.equal(linha.razao, 'Fulano de Tal');
  assert.equal(linha.qte_vagas, 2);
  // tolerancia_dias não veio do dbf (sem mapeamento) -> cai no padrão (0), não fica null (coluna NOT NULL no banco)
  assert.equal(linha.tolerancia_dias, 0);
  assert.equal(linha.ativo, true);
  // sem valor e sem padrão -> null
  assert.equal(linha.dia_venc, null);
});
