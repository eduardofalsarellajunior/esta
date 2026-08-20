import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limparLogradouro } from './cnpj.js';

test('limparLogradouro: tira o número quando vem colado no fim do logradouro', () => {
  assert.equal(limparLogradouro('PAULISTA 37', '37'), 'PAULISTA');
});

test('limparLogradouro: sem número duplicado, mantém como está', () => {
  assert.equal(limparLogradouro('RUA DAS FLORES', '100'), 'RUA DAS FLORES');
});

test('limparLogradouro: sem numero informado, mantém como está', () => {
  assert.equal(limparLogradouro('RUA DAS FLORES 100', ''), 'RUA DAS FLORES 100');
});

test('limparLogradouro: vazio não quebra', () => {
  assert.equal(limparLogradouro('', '37'), '');
  assert.equal(limparLogradouro(null, null), '');
});
