import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modeloParaEscPos } from './escpos.js';

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

test('modeloParaEscPos: começa com init + codepage 850', () => {
  const bytes = Array.from(modeloParaEscPos('X', {}));
  assert.deepEqual(bytes.slice(0, 5), [ESC, 0x40, ESC, 0x74, 2]);
});

test('modeloParaEscPos: texto ASCII vira os próprios bytes', () => {
  const bytes = Array.from(modeloParaEscPos('ABC', {}));
  // depois do cabeçalho de init: 'A','B','C', LF, e mais 4 LF de alimentação no fim.
  assert.deepEqual(bytes.slice(5), [0x41, 0x42, 0x43, LF, LF, LF, LF, LF]);
});

test('modeloParaEscPos: acentos em CP850 (mesma tabela do leitor de DBF)', () => {
  const bytes = Array.from(modeloParaEscPos('ç é', {}));
  // 'ç' = 0x87, espaço = 0x20, 'é' = 0x82 na CP850 (packages/dbf/dbf.ts).
  assert.deepEqual(bytes.slice(5, 8), [0x87, 0x20, 0x82]);
});

test('modeloParaEscPos: caractere sem equivalente vira "?" (0x3F), não trava', () => {
  const bytes = Array.from(modeloParaEscPos('A€B', {})); // € não está na CP850
  assert.deepEqual(bytes.slice(5, 8), [0x41, 0x3f, 0x42]);
});

test('modeloParaEscPos: negrito — comandos exatos ao redor do trecho', () => {
  const bytes = Array.from(modeloParaEscPos('@PE+@X@PE-@Y', {}));
  const corpo = bytes.slice(5); // depois do cabeçalho de init
  assert.deepEqual(corpo, [
    ESC, 0x45, 1, // liga negrito
    0x58,          // X
    ESC, 0x45, 0,  // desliga negrito
    0x59,          // Y
    // fim de linha: nenhuma transição pendente (já tinha desligado) + LF
    LF, LF, LF, LF, LF,
  ]);
});

test('modeloParaEscPos: @PG+@ liga largura/altura dupla (GS !)', () => {
  const bytes = Array.from(modeloParaEscPos('@PG+@X@PG-@', {}));
  const corpo = bytes.slice(5);
  assert.deepEqual(corpo, [
    GS, 0x21, 0x11, // grande ligado
    0x58,
    GS, 0x21, 0x00, // grande desligado
    LF, LF, LF, LF, LF,
  ]);
});

test('modeloParaEscPos: linha em branco (@P1@ etc.) vira só um LF, sem comandos', () => {
  const bytes = Array.from(modeloParaEscPos('A@P2@B', {}));
  const corpo = bytes.slice(5);
  // 'A' LF (fim da linha 1) LF (linha em branco do @P2@) 'B' LF ...alimentação
  assert.deepEqual(corpo, [0x41, LF, LF, 0x42, LF, LF, LF, LF, LF]);
});
