import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarDitadoPlaca, acumularDitado } from './ditadoPlaca.js';

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

// Acúmulo dos trechos finais (o bug do "ttltltl") -------------------------
const r = (transcript: string, isFinal: boolean) => ({ transcript, isFinal });

test('acumularDitado: trecho final já aproveitado não entra de novo', () => {
  // Evento 1: "tê" vira final -> aproveita.
  const e1 = acumularDitado([r('tê', true)], 0);
  assert.equal(e1.finais.trim(), 'tê');
  assert.equal(e1.consumidos, 1);

  // Evento 2: a lista vem CUMULATIVA (o "tê" de novo) + um palpite parcial.
  // Antes, o "tê" era concatenado outra vez — é o que duplicava as letras.
  const e2 = acumularDitado([r('tê', true), r('éle', false)], e1.consumidos);
  assert.equal(e2.finais, '');
  assert.equal(e2.interim, 'éle');
  assert.equal(e2.consumidos, 1);

  // Evento 3: o "éle" fecha -> só ele entra.
  const e3 = acumularDitado([r('tê', true), r('éle', true)], e2.consumidos);
  assert.equal(e3.finais.trim(), 'éle');
  assert.equal(e3.consumidos, 2);
});

test('acumularDitado: a placa ditada sai inteira, sem letra repetida', () => {
  // Simula os eventos cumulativos de "tê / éle / i / oito" e monta o bruto
  // como o componente faz. Sem a correção, o resultado virava "TTLTLTL".
  const eventos = [
    [r('tê', true)],
    [r('tê', true), r('éle', false)],
    [r('tê', true), r('éle', true)],
    [r('tê', true), r('éle', true), r('i', true)],
    [r('tê', true), r('éle', true), r('i', true), r('oito', true)],
  ];
  let bruto = '';
  let consumidos = 0;
  for (const ev of eventos) {
    const saida = acumularDitado(ev, consumidos);
    bruto += saida.finais;
    consumidos = saida.consumidos;
  }
  assert.equal(normalizarDitadoPlaca(bruto), 'TLI8');
});

test('acumularDitado: só parciais não consomem nada', () => {
  const saida = acumularDitado([r('teee', false)], 0);
  assert.equal(saida.finais, '');
  assert.equal(saida.interim, 'teee');
  assert.equal(saida.consumidos, 0);
});
