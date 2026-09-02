import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparPorConvenio, gruposDeConvenios, textoRelatorioConvenios } from './relatorioConvenios.js';

/** Convênios do exemplo: C1/C2/C3 no grupo "C", e um avulso sem grupo. */
const CONVENIOS = {
  C1: { razao: 'Loja Centro', grupo: 'C' },
  C2: { razao: 'Loja Norte', grupo: 'C' },
  C3: { razao: 'Loja Sul', grupo: 'C' },
  X9: { razao: 'Padaria', grupo: '' },
};

const mov = (codigo: string, valor: number) => ({ convenio_codigo: codigo, valor_convenio: valor });

test('agrupa por grupo e por código, com subtotal de cada código e total do grupo', () => {
  const r = agruparPorConvenio(
    [mov('C1', 10), mov('C2', 20), mov('C1', 5), mov('C3', 7)],
    CONVENIOS,
  );
  assert.equal(r.grupos.length, 1);
  const grupoC = r.grupos[0];
  assert.equal(grupoC.grupo, 'C');
  assert.deepEqual(grupoC.convenios.map((c) => c.codigo), ['C1', 'C2', 'C3']);
  // Subtotal de cada código.
  assert.deepEqual(grupoC.convenios.map((c) => c.total), [15, 20, 7]);
  assert.deepEqual(grupoC.convenios.map((c) => c.qtde), [2, 1, 1]);
  // Total do grupo = soma dos 3 códigos.
  assert.equal(grupoC.total, 42);
  assert.equal(grupoC.qtde, 4);
  assert.equal(r.total, 42);
});

test('convênio sem grupo vai pro bloco vazio, que fica sempre por último', () => {
  const r = agruparPorConvenio([mov('X9', 3), mov('C1', 10)], CONVENIOS);
  assert.deepEqual(r.grupos.map((g) => g.grupo), ['C', '']);
  assert.equal(r.grupos[1].convenios[0].codigo, 'X9');
  assert.equal(r.total, 13);
});

test('grupos saem em ordem alfabética', () => {
  const convenios = { A1: { grupo: 'Z' }, B1: { grupo: 'A' }, C1: { grupo: 'M' } };
  const r = agruparPorConvenio([mov('A1', 1), mov('B1', 1), mov('C1', 1)], convenios);
  assert.deepEqual(r.grupos.map((g) => g.grupo), ['A', 'M', 'Z']);
});

test('estadia sem desconto de convênio entra na listagem contando zero', () => {
  // O convênio pode não ter bancado nada (cadastro sem desconto, ou a saída
  // caiu fora da regra) — a estadia ainda é do convênio e precisa aparecer.
  const r = agruparPorConvenio([mov('C1', 0), mov('C1', 10)], CONVENIOS);
  assert.equal(r.grupos[0].convenios[0].qtde, 2);
  assert.equal(r.grupos[0].convenios[0].total, 10);
});

test('somas não acumulam sobra de ponto flutuante', () => {
  // 0.1 + 0.2 = 0.30000000000000004 — sem arredondar, o total do grupo
  // apareceria com uma dízima no relatório impresso.
  const r = agruparPorConvenio([mov('C1', 0.1), mov('C2', 0.2)], CONVENIOS);
  assert.equal(r.grupos[0].total, 0.3);
  assert.equal(r.total, 0.3);
});

test('convênio que não está no cadastro não derruba o relatório', () => {
  // Movimento antigo cujo convênio foi excluído do cadastro depois.
  const r = agruparPorConvenio([mov('SUMIU', 5)], CONVENIOS);
  assert.equal(r.grupos[0].grupo, '');
  assert.equal(r.grupos[0].convenios[0].codigo, 'SUMIU');
  assert.equal(r.total, 5);
});

test('gruposDeConvenios: distintos, sem vazios, em ordem', () => {
  assert.deepEqual(
    gruposDeConvenios([{ grupo: 'C' }, { grupo: '' }, { grupo: 'A' }, { grupo: 'C' }, {}]),
    ['A', 'C'],
  );
});

// Texto pro WhatsApp/e-mail -------------------------------------------------
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
const linhaMov = (codigo: string, valor: number, extra = {}) =>
  ({ convenio_codigo: codigo, valor_convenio: valor, controle: 42, placa: 'ABC1D23', modelo: 'GOL',
     dt_entrada: '2026-09-01', dt_saida: '2026-09-01', ...extra });

test('texto: resumo traz totais por código e do grupo, sem listar estadia', () => {
  const dados = agruparPorConvenio([linhaMov('C1', 10), linhaMov('C2', 20)], CONVENIOS);
  const txt = textoRelatorioConvenios({
    dados, de: '2026-09-01', ate: '2026-09-30', filial: { nome_fantasia: 'Ginpark' }, fmtBRL: brl,
  });
  assert.match(txt, /GRUPO C/);
  assert.match(txt, /C1 · Loja Centro — 1 estadia\(s\): R\$ 10,00/);
  assert.match(txt, /TOTAL DO GRUPO C — 2 estadia\(s\): R\$ 30,00/);
  assert.match(txt, /TOTAL GERAL — 2 estadia\(s\): R\$ 30,00/);
  // Sem detalhar, a placa não aparece — é o que mantém o texto curto o
  // bastante pra caber num link de WhatsApp.
  assert.ok(!txt.includes('ABC1D23'));
});

test('texto: detalhado lista cada estadia', () => {
  const dados = agruparPorConvenio([linhaMov('C1', 10)], CONVENIOS);
  const txt = textoRelatorioConvenios({
    dados, de: '2026-09-01', ate: '2026-09-30', filial: {}, detalhar: true, fmtBRL: brl,
  });
  assert.match(txt, /0042 ABC1D23 GOL/);
  assert.match(txt, /01\/09\/2026 → 01\/09\/2026: R\$ 10,00/);
});

test('texto: sem grupo não inventa cabeçalho nem total de grupo', () => {
  const dados = agruparPorConvenio([linhaMov('X9', 5)], CONVENIOS);
  const txt = textoRelatorioConvenios({
    dados, de: '2026-09-01', ate: '2026-09-30', filial: {}, fmtBRL: brl,
  });
  assert.ok(!txt.includes('GRUPO'));
  assert.match(txt, /TOTAL GERAL — 1 estadia\(s\): R\$ 5,00/);
});

test('texto: período vazio avisa em vez de sair só com cabeçalho', () => {
  const txt = textoRelatorioConvenios({
    dados: { grupos: [], total: 0, qtde: 0 }, de: '2026-09-01', ate: '2026-09-30', filial: {}, fmtBRL: brl,
  });
  assert.match(txt, /Nenhuma estadia de convênio no período/);
});

test('texto: filtros aplicados aparecem no cabeçalho', () => {
  const dados = agruparPorConvenio([linhaMov('C1', 10)], CONVENIOS);
  const txt = textoRelatorioConvenios({
    dados, de: '2026-09-01', ate: '2026-09-30', filial: {}, convenioFiltro: 'C1', grupoFiltro: 'C', fmtBRL: brl,
  });
  assert.match(txt, /Convênio: C1/);
  assert.match(txt, /Grupo: C/);
});
