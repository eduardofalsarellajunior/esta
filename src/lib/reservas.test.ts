import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diasSemVaga, prefixoTabela, mapaTabelaPorTipo, valorPropostoReserva } from './reservas.js';
import type { TabelaPreco } from '../../packages/tarifacao/tarifacao.ts';

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

test('prefixoTabela: letras iniciais do código, maiúsculas', () => {
  assert.equal(prefixoTabela('C001'), 'C');
  assert.equal(prefixoTabela('g045'), 'G');
  assert.equal(prefixoTabela('BOX01'), 'BOX');
  assert.equal(prefixoTabela('12A'), ''); // começa com dígito -> sem prefixo
  assert.equal(prefixoTabela(''), '');
  assert.equal(prefixoTabela(null), '');
});

test('mapaTabelaPorTipo: prefixo predominante por tipo, ignora tipo sem prefixo reconhecível', () => {
  const vagas = [
    { tipo: 'Coberta', codigo: 'C001' }, { tipo: 'Coberta', codigo: 'C002' },
    { tipo: 'Coberta', codigo: 'G099' }, // prefixo minoritário nesse tipo -> não vence
    { tipo: 'Descoberta', codigo: 'D001' },
    { tipo: 'SemPrefixo', codigo: '001' },
  ];
  assert.deepEqual(mapaTabelaPorTipo(vagas), { Coberta: 'C', Descoberta: 'D' });
});

test('valorPropostoReserva: sem tabela pro código -> null', () => {
  assert.equal(valorPropostoReserva({}, 'C', '2026-09-01', '2026-09-01'), null);
});

test('valorPropostoReserva: 1 diária (mesmo dia início/fim)', () => {
  const tabelas: Record<string, TabelaPreco> = {
    C: { tipo: 'C', faixas: [{ ate: 9999, hor: 50, con: 0, tipoCobranca: 'hora', periodo: 24 }] },
  };
  const r = valorPropostoReserva(tabelas, 'C', '2026-09-01', '2026-09-01');
  assert.deepEqual(r, { valor: 50, pedeValor: false, manual: false });
});

test('valorPropostoReserva: 3 diárias corridas', () => {
  const tabelas: Record<string, TabelaPreco> = {
    C: { tipo: 'C', faixas: [{ ate: 9999, hor: 50, con: 0, tipoCobranca: 'hora', periodo: 24 }] },
  };
  const r = valorPropostoReserva(tabelas, 'C', '2026-09-01', '2026-09-03');
  assert.equal(r?.valor, 150);
});
