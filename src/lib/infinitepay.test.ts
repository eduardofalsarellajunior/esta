import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  linkInfiniteTap,
  motivoNaoPodeCobrar,
  parcelasPossiveis,
  configInfinitePay,
} from './infinitepay.js';

/** Query string do deeplink como mapa, pra conferir parâmetro a parâmetro. */
function params(link: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(link.split('?')[1]));
}

test('linkInfiniteTap: valor vai em CENTAVOS (100 = R$ 1,00)', () => {
  const p = params(linkInfiniteTap({ valor: 12.5, metodo: 'debit' }));
  assert.equal(p.amount, '1250');
  assert.equal(p.payment_method, 'debit');
  // installments só faz sentido no crédito.
  assert.equal(p.installments, undefined);
});

test('linkInfiniteTap: arredonda centavos em vez de truncar', () => {
  // 0.1 + 0.2 = 0.30000000000000004 em ponto flutuante — sem arredondar,
  // Math.round evita mandar 3000.0000000000005 pra API.
  assert.equal(params(linkInfiniteTap({ valor: 0.1 + 0.2, metodo: 'debit' })).amount, '30');
  assert.equal(params(linkInfiniteTap({ valor: 7.005, metodo: 'debit' })).amount, '701');
});

test('linkInfiniteTap: crédito manda installments', () => {
  const p = params(linkInfiniteTap({ valor: 100, metodo: 'credit', parcelas: 3 }));
  assert.equal(p.installments, '3');
});

test('linkInfiniteTap: handle/doc_number só entram quando configurados', () => {
  const semConfig = params(linkInfiniteTap({ valor: 10, metodo: 'debit' }));
  assert.equal(semConfig.handle, undefined);
  assert.equal(semConfig.doc_number, undefined);

  const comConfig = params(linkInfiniteTap({
    valor: 10, metodo: 'debit', orderId: 'abc-123',
    config: { handle: 'ginpark', docNumber: '27346981000144' },
  }));
  assert.equal(comConfig.handle, 'ginpark');
  assert.equal(comConfig.doc_number, '27346981000144');
  assert.equal(comConfig.order_id, 'abc-123');
});

test('linkInfiniteTap: sempre identifica o sistema de origem', () => {
  assert.equal(params(linkInfiniteTap({ valor: 10, metodo: 'debit' })).app_client_referrer, 'esta');
});

test('linkInfiniteTap: aponta pro deeplink do app da InfinitePay', () => {
  assert.ok(linkInfiniteTap({ valor: 10, metodo: 'debit' }).startsWith('infinitepaydash://infinitetap-app?'));
});

test('parcelasPossiveis: cada parcela precisa ter pelo menos R$ 1,00', () => {
  assert.equal(parcelasPossiveis(10), 10);
  assert.equal(parcelasPossiveis(2.5), 2);
  // Teto de 12 mesmo em valor alto.
  assert.equal(parcelasPossiveis(500), 12);
  // Abaixo do mínimo ainda devolve 1 (quem barra é motivoNaoPodeCobrar).
  assert.equal(parcelasPossiveis(0.5), 1);
});

test('motivoNaoPodeCobrar: valor abaixo do mínimo e forma que não é cartão', () => {
  assert.ok(motivoNaoPodeCobrar({ valor: 0.5, metodo: 'debit' }));
  assert.ok(motivoNaoPodeCobrar({ valor: 10, metodo: undefined }));
  assert.equal(motivoNaoPodeCobrar({ valor: 10, metodo: 'debit' }), null);
});

test('motivoNaoPodeCobrar: parcela abaixo de R$ 1,00 é recusada', () => {
  // R$ 10 em 12x daria R$ 0,83 por parcela — é o exemplo da própria
  // documentação da InfinitePay.
  assert.ok(motivoNaoPodeCobrar({ valor: 10, metodo: 'credit', parcelas: 12 }));
  assert.equal(motivoNaoPodeCobrar({ valor: 10, metodo: 'credit', parcelas: 10 }), null);
});

test('configInfinitePay: desligado por padrão e CNPJ vira doc_number sem pontuação', () => {
  assert.deepEqual(configInfinitePay(null), { ativo: false, handle: '', docNumber: '' });
  assert.deepEqual(
    configInfinitePay({ cnpj: '27.346.981/0001-44', config: { infinitepay: { ativo: true, handle: 'ginpark' } } }),
    { ativo: true, handle: 'ginpark', docNumber: '27346981000144' },
  );
});
