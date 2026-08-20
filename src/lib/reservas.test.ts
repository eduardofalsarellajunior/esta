import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diasSemVaga } from './reservas.js';

test('diasSemVaga: intervalo de 15 dias com 1 dia sem vaga coberta no meio', () => {
  const mapa: Record<string, Record<string, number>> = {};
  for (let d = 1; d <= 15; d++) {
    const iso = `2026-09-${String(d).padStart(2, '0')}`;
    mapa[iso] = { coberta: d === 8 ? 0 : 3, descoberta: 10 };
  }
  const dias = diasSemVaga(mapa, 'coberta', '2026-09-01', '2026-09-15');
  assert.deepEqual(dias, ['2026-09-08']);
});

test('diasSemVaga: tudo livre -> lista vazia', () => {
  const mapa = { '2026-09-01': { coberta: 2 }, '2026-09-02': { coberta: 1 } };
  assert.deepEqual(diasSemVaga(mapa, 'coberta', '2026-09-01', '2026-09-02'), []);
});

test('diasSemVaga: dia fora do mapa (sem dado nenhum) conta como sem vaga', () => {
  const mapa = { '2026-09-01': { coberta: 2 } };
  assert.deepEqual(diasSemVaga(mapa, 'coberta', '2026-09-01', '2026-09-02'), ['2026-09-02']);
});
