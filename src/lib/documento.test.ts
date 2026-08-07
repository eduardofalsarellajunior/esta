import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarCpf, validarCnpj, validarCpfCnpj, erroCpfCnpj, formatarCpfCnpj, apenasDigitos } from './documento.js';

test('validarCpf: aceita CPF válido, com e sem máscara', () => {
  assert.equal(validarCpf('529.982.247-25'), true);
  assert.equal(validarCpf('52998224725'), true);
  // O da nota real que o Eduardo mandou (R_00000434).
  assert.equal(validarCpf('41966118856'), true);
});

test('validarCpf: rejeita dígito verificador errado', () => {
  assert.equal(validarCpf('52998224724'), false);
  assert.equal(validarCpf('11144477734'), false);
});

test('validarCpf: rejeita repetidos (passariam no cálculo) e tamanho errado', () => {
  assert.equal(validarCpf('11111111111'), false);
  assert.equal(validarCpf('00000000000'), false);
  assert.equal(validarCpf('5299822472'), false);
  assert.equal(validarCpf(''), false);
});

test('validarCnpj: aceita CNPJ válido, com e sem máscara', () => {
  assert.equal(validarCnpj('11.222.333/0001-81'), true);
  assert.equal(validarCnpj('11222333000181'), true);
  // Os dois CNPJs reais que aparecem nos testes fiscais.
  assert.equal(validarCnpj('47826100000135'), true);
  assert.equal(validarCnpj('39969116000179'), true);
});

test('validarCnpj: rejeita dígito errado, repetidos e tamanho errado', () => {
  assert.equal(validarCnpj('11222333000182'), false);
  assert.equal(validarCnpj('11111111111111'), false);
  assert.equal(validarCnpj('1122233300018'), false);
});

test('validarCpfCnpj: decide pelo tamanho e trata vazio como válido (tomador sem documento)', () => {
  assert.deepEqual(validarCpfCnpj(''), { vazio: true, valido: true, tipo: null });
  assert.deepEqual(validarCpfCnpj('   '), { vazio: true, valido: true, tipo: null });
  assert.deepEqual(validarCpfCnpj('52998224725'), { vazio: false, valido: true, tipo: 'CPF' });
  assert.deepEqual(validarCpfCnpj('11222333000181'), { vazio: false, valido: true, tipo: 'CNPJ' });
  assert.deepEqual(validarCpfCnpj('52998224724'), { vazio: false, valido: false, tipo: 'CPF' });
  assert.deepEqual(validarCpfCnpj('123'), { vazio: false, valido: false, tipo: null });
});

test('erroCpfCnpj: mensagem só quando há erro', () => {
  assert.equal(erroCpfCnpj(''), null);
  assert.equal(erroCpfCnpj('52998224725'), null);
  assert.equal(erroCpfCnpj('52998224724'), 'CPF inválido — confira os números.');
  assert.equal(erroCpfCnpj('11222333000182'), 'CNPJ inválido — confira os números.');
  assert.equal(erroCpfCnpj('123'), 'Deve ter 11 dígitos (CPF) ou 14 (CNPJ).');
});

test('formatarCpfCnpj e apenasDigitos', () => {
  assert.equal(formatarCpfCnpj('52998224725'), '529.982.247-25');
  assert.equal(formatarCpfCnpj('11222333000181'), '11.222.333/0001-81');
  assert.equal(formatarCpfCnpj('123'), '123');
  assert.equal(apenasDigitos('529.982.247-25'), '52998224725');
  assert.equal(apenasDigitos(null), '');
});
