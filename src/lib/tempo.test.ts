import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataHoraLocalISO } from './tempo.js';

// dataHoraLocalISO -----------------------------------------------------------
// Formato exigido pelo Sem Parar (dataEntrada/dataSaida do método Recebe) —
// "YYYY-MM-DDTHH:MM:SS" local, sem sufixo de fuso. Errar isso manda a hora
// certa com o rótulo errado (o Sem Parar leria como UTC).

test('dataHoraLocalISO: hora comercial HH.MM -> HH:MM:SS, sem sufixo de fuso', () => {
  assert.equal(dataHoraLocalISO('2026-05-28', 10.54), '2026-05-28T10:54:00');
});

test('dataHoraLocalISO: meia-noite e hora exata (minuto 0)', () => {
  assert.equal(dataHoraLocalISO('2026-01-01', 0), '2026-01-01T00:00:00');
  assert.equal(dataHoraLocalISO('2026-01-01', 14), '2026-01-01T14:00:00');
});

test('dataHoraLocalISO: preenche com zero à esquerda (não vira "9:5:0")', () => {
  assert.equal(dataHoraLocalISO('2026-01-05', 9.05), '2026-01-05T09:05:00');
});

test('dataHoraLocalISO: usa toISOString() converteria pra UTC (regressão) — aqui não muda o dia', () => {
  // Se algum dia isto voltar a usar Date.toISOString() sem querer, um
  // horário perto da virada de dia (ex.: 23h) mudaria de DIA no fuso de
  // Brasília (UTC-3) — o teste falharia, sinalizando a regressão.
  assert.equal(dataHoraLocalISO('2026-06-15', 23), '2026-06-15T23:00:00');
});
