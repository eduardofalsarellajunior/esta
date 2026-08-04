import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodificarCp850, lerDbf } from './dbf.ts';

// Helpers pra montar um .DBF sintético em memória (não temos um .dbf real do
// legado aqui — só existem na máquina do Eduardo).

function campoDescriptor(nome: string, tipo: string, tamanho: number, decimais = 0): Uint8Array {
  const d = new Uint8Array(32);
  for (let i = 0; i < Math.min(nome.length, 11); i++) d[i] = nome.charCodeAt(i);
  d[11] = tipo.charCodeAt(0);
  d[16] = tamanho;
  d[17] = decimais;
  return d;
}

function header(numRegistros: number, tamanhoHeader: number, tamanhoRegistro: number): Uint8Array {
  const h = new Uint8Array(32);
  h[0] = 0x03;
  new DataView(h.buffer).setUint32(4, numRegistros, true);
  new DataView(h.buffer).setUint16(8, tamanhoHeader, true);
  new DataView(h.buffer).setUint16(10, tamanhoRegistro, true);
  return h;
}

function concatenar(...partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const buf = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { buf.set(p, pos); pos += p.length; }
  return buf;
}

function ascii(texto: string): Uint8Array {
  return Uint8Array.from(texto, (c) => c.charCodeAt(0));
}

/** Bytes CP850 pra um texto — só cobre os acentos usados nos testes abaixo. */
function cp850(texto: string): Uint8Array {
  const MAPA: Record<string, number> = { ç: 0x87, É: 0x90, ñ: 0xa4, Ã: 0xc7 };
  return Uint8Array.from(texto, (c) => (c in MAPA ? MAPA[c] : c.charCodeAt(0)));
}

test('decodificarCp850: bytes altos conhecidos (acentuação pt-BR)', () => {
  assert.equal(decodificarCp850(new Uint8Array([0x87])), 'ç');
  assert.equal(decodificarCp850(new Uint8Array([0x90])), 'É');
  assert.equal(decodificarCp850(new Uint8Array([0xa4])), 'ñ');
  assert.equal(decodificarCp850(new Uint8Array([0xc7])), 'Ã');
});

test('decodificarCp850: ASCII (0x00–0x7F) passa direto, sem tabela', () => {
  assert.equal(decodificarCp850(ascii('ABC 123')), 'ABC 123');
});

test('lerDbf: header, campos e registros (com um registro excluído)', () => {
  const campoNome = campoDescriptor('NOME', 'C', 10);
  const campoIdade = campoDescriptor('IDADE', 'N', 3);
  const terminador = new Uint8Array([0x0d]);
  const tamanhoHeader = 32 + 32 * 2 + 1;
  const tamanhoRegistro = 1 + 10 + 3; // flag + NOME(10) + IDADE(3)

  // Registro 1: ativo, "JOÃO" (com acento CP850) + idade 30.
  const reg1 = concatenar(
    ascii(' '), // flag = ativo (0x20)
    cp850('JOÃO'), ascii('      '), // 'JOÃO' (4) + padding até 10
    ascii(' 30'),
  );
  // Registro 2: marcado como excluído (0x2A) — não deve aparecer no resultado.
  const reg2 = concatenar(
    ascii('*'),
    ascii('MARIA'), ascii('     '), // 10 chars
    ascii(' 25'),
  );

  const buffer = concatenar(
    header(2, tamanhoHeader, tamanhoRegistro),
    campoNome, campoIdade, terminador,
    reg1, reg2,
  ).buffer;

  const { campos, registros } = lerDbf(buffer);

  assert.deepEqual(campos, [
    { nome: 'NOME', tipo: 'C', tamanho: 10, decimais: 0 },
    { nome: 'IDADE', tipo: 'N', tamanho: 3, decimais: 0 },
  ]);
  assert.equal(registros.length, 1); // o excluído (MARIA) foi descartado
  assert.deepEqual(registros[0], { NOME: 'JOÃO', IDADE: 30 });
});

test('lerDbf: campos lógico e data', () => {
  const campoAtivo = campoDescriptor('ATIVO', 'L', 1);
  const campoDt = campoDescriptor('DTNASC', 'D', 8);
  const terminador = new Uint8Array([0x0d]);
  const tamanhoHeader = 32 + 32 * 2 + 1;
  const tamanhoRegistro = 1 + 1 + 8;

  const reg = concatenar(ascii(' '), ascii('T'), ascii('19850312'));
  const buffer = concatenar(
    header(1, tamanhoHeader, tamanhoRegistro),
    campoAtivo, campoDt, terminador,
    reg,
  ).buffer;

  const { registros } = lerDbf(buffer);
  assert.deepEqual(registros[0], { ATIVO: true, DTNASC: '1985-03-12' });
});
