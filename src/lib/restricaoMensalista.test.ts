import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diaSemanaLegado, turnoDoHorario, turnoContratado, calcularRestricaoEntrada } from './restricaoMensalista.js';

test('diaSemanaLegado: 1=domingo…7=sábado (getDay() é 0=domingo)', () => {
  assert.equal(diaSemanaLegado(new Date(2026, 7, 9)), 1);  // domingo
  assert.equal(diaSemanaLegado(new Date(2026, 7, 10)), 2); // segunda
  assert.equal(diaSemanaLegado(new Date(2026, 7, 15)), 7); // sábado
});

test('turnoDoHorario: padrão do legado (sem período configurado) é 6h/12h/18h', () => {
  assert.equal(turnoDoHorario(5.59, 0, 0, 0), 'N');
  assert.equal(turnoDoHorario(6.0, 0, 0, 0), 'M');
  assert.equal(turnoDoHorario(11.59, 0, 0, 0), 'M');
  assert.equal(turnoDoHorario(12.0, 0, 0, 0), 'T');
  assert.equal(turnoDoHorario(17.59, 0, 0, 0), 'T');
  assert.equal(turnoDoHorario(18.0, 0, 0, 0), 'N');
});

test('turnoDoHorario: período customizado do mensalista', () => {
  assert.equal(turnoDoHorario(7.0, 8.0, 12.0, 18.0), 'N');  // antes do período 1
  assert.equal(turnoDoHorario(8.0, 8.0, 12.0, 18.0), 'M');
  assert.equal(turnoDoHorario(12.0, 8.0, 12.0, 18.0), 'T');
});

test('turnoContratado: campo vazio/ausente = sem restrição (contratado todo dia)', () => {
  assert.equal(turnoContratado('M', 1, null, null, null), true);
  assert.equal(turnoContratado('M', 1, '', '', ''), true);
  assert.equal(turnoContratado('M', 7, undefined, undefined, undefined), true);
});

test('turnoContratado: lê a posição do dia (1=domingo…7=sábado)', () => {
  // NSSSSSN: domingo(1) e sábado(7) não contratados, resto sim.
  assert.equal(turnoContratado('M', 1, 'NSSSSSN', '', ''), false); // domingo
  assert.equal(turnoContratado('M', 4, 'NSSSSSN', '', ''), true);  // quarta
  assert.equal(turnoContratado('M', 7, 'NSSSSSN', '', ''), false); // sábado
});

const semRestricao = { restr_manha: null, restr_tarde: null, restr_noite: null, periodo1: 0, periodo2: 0, periodo3: 0 };

test('calcularRestricaoEntrada: sem nenhuma restrição configurada, sempre dentro do horário', () => {
  const r = calcularRestricaoEntrada({ horaEntrada: 10.0, diaSemana: 1, mensalista: semRestricao });
  assert.deepEqual(r, { dentroDoHorario: true, livreAPartir: null });
});

test('calcularRestricaoEntrada: contratou só a tarde, entra de manhã -> fora, libera às 12h', () => {
  const mensalista = { restr_manha: 'NNNNNNN', restr_tarde: 'SSSSSSS', restr_noite: 'NNNNNNN', periodo1: 0, periodo2: 0, periodo3: 0 };
  const r = calcularRestricaoEntrada({ horaEntrada: 10.0, diaSemana: 3, mensalista });
  assert.deepEqual(r, { dentroDoHorario: false, livreAPartir: 12.0 });
});

test('calcularRestricaoEntrada: contratou a tarde e entra dentro dela -> ok, sem restrição', () => {
  const mensalista = { restr_manha: 'NNNNNNN', restr_tarde: 'SSSSSSS', restr_noite: 'NNNNNNN', periodo1: 0, periodo2: 0, periodo3: 0 };
  const r = calcularRestricaoEntrada({ horaEntrada: 14.0, diaSemana: 3, mensalista });
  assert.deepEqual(r, { dentroDoHorario: true, livreAPartir: null });
});

test('calcularRestricaoEntrada: só contratou a manhã, entra à noite -> fora, sem turno seguinte no dia (avulso a estadia toda)', () => {
  const mensalista = { restr_manha: 'SSSSSSS', restr_tarde: 'NNNNNNN', restr_noite: 'NNNNNNN', periodo1: 0, periodo2: 0, periodo3: 0 };
  const r = calcularRestricaoEntrada({ horaEntrada: 20.0, diaSemana: 3, mensalista });
  assert.deepEqual(r, { dentroDoHorario: false, livreAPartir: null });
});

test('calcularRestricaoEntrada: não contratou nem a tarde nem a noite -> pula pro próximo contratado (noite)', () => {
  const mensalista = { restr_manha: 'SSSSSSS', restr_tarde: 'NNNNNNN', restr_noite: 'SSSSSSS', periodo1: 0, periodo2: 0, periodo3: 0 };
  const r = calcularRestricaoEntrada({ horaEntrada: 13.0, diaSemana: 3, mensalista });
  assert.deepEqual(r, { dentroDoHorario: false, livreAPartir: 18.0 });
});

test('calcularRestricaoEntrada: restrição só vale no dia da semana errado (domingo bloqueado, resto livre)', () => {
  const mensalista = { restr_manha: 'NSSSSSS', restr_tarde: null, restr_noite: null, periodo1: 0, periodo2: 0, periodo3: 0 };
  const domingo = calcularRestricaoEntrada({ horaEntrada: 8.0, diaSemana: 1, mensalista });
  assert.equal(domingo.dentroDoHorario, false);
  assert.equal(domingo.livreAPartir, 12.0); // tarde livre (sem restrição própria)
  const segunda = calcularRestricaoEntrada({ horaEntrada: 8.0, diaSemana: 2, mensalista });
  assert.deepEqual(segunda, { dentroDoHorario: true, livreAPartir: null });
});

test('calcularRestricaoEntrada: madrugada (antes do período 1) ainda tem manhã e tarde do mesmo dia pela frente', () => {
  // Turno "noite" cobre também o início do dia (antes do período 1) — uma
  // entrada de madrugada não pode ficar "presa" nesse turno sem olhar pra
  // frente só porque N é o último da lista M/T/N.
  const mensalista = { restr_manha: 'NNNNNNN', restr_tarde: 'SSSSSSS', restr_noite: 'NNNNNNN', periodo1: 8.0, periodo2: 13.0, periodo3: 19.0 };
  const r = calcularRestricaoEntrada({ horaEntrada: 5.0, diaSemana: 3, mensalista });
  assert.deepEqual(r, { dentroDoHorario: false, livreAPartir: 13.0 });
});

test('calcularRestricaoEntrada: período customizado do mensalista', () => {
  const mensalista = { restr_manha: 'NNNNNNN', restr_tarde: 'SSSSSSS', restr_noite: 'NNNNNNN', periodo1: 8.0, periodo2: 13.0, periodo3: 19.0 };
  const r = calcularRestricaoEntrada({ horaEntrada: 7.0, diaSemana: 5, mensalista });
  assert.deepEqual(r, { dentroDoHorario: false, livreAPartir: 13.0 });
});
