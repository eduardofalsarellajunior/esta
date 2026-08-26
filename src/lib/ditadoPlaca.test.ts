import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarDitadoPlaca } from './ditadoPlaca.js';

test('normalizarDitadoPlaca: letras e números por extenso', () => {
  assert.equal(normalizarDitadoPlaca('a be ce um de dois tres'), 'ABC1D23');
});

test('normalizarDitadoPlaca: já em letras/dígitos soltos (alguns navegadores devolvem assim)', () => {
  assert.equal(normalizarDitadoPlaca('A B C 1 D 2 3'), 'ABC1D23');
});

test('normalizarDitadoPlaca: acento na palavra dita (cê, é, agá...)', () => {
  assert.equal(normalizarDitadoPlaca('cê cê cê zero um zero um'), 'CCC0101');
});

test('normalizarDitadoPlaca: mistura de letra solta e nome fonético', () => {
  assert.equal(normalizarDitadoPlaca('erre e agá vê quatro cinco'), 'REHV45');
});

test('normalizarDitadoPlaca: palavra não reconhecida é ignorada (best-effort)', () => {
  assert.equal(normalizarDitadoPlaca('a be blablabla ce'), 'ABC');
});

test('normalizarDitadoPlaca: corta em 7 caracteres (placa não passa disso)', () => {
  assert.equal(normalizarDitadoPlaca('a be ce um de dois tres quatro'), 'ABC1D23');
});

test('normalizarDitadoPlaca: texto vazio/indefinido não quebra', () => {
  assert.equal(normalizarDitadoPlaca(''), '');
  assert.equal(normalizarDitadoPlaca(undefined), '');
});
