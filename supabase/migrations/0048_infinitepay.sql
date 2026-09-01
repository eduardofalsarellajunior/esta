-- =============================================================================
-- 0048_infinitepay.sql — InfiniteTap (Tap to Pay da InfinitePay)
--
-- O celular do operador vira a maquininha: o cliente aproxima o cartão no
-- próprio aparelho. A integração é só por DEEPLINK entre os dois apps, sem
-- API e sem chave (ver docs/INFINITEPAY.md) — por isso nada de segredo aqui.
--
-- Esta migration só marca QUAIS formas de pagamento correspondem a crédito e
-- a débito no InfiniteTap. O resto (handle da conta, liga/desliga) fica em
-- filiais.config.infinitepay, que já é jsonb e não precisa de coluna nova.
-- =============================================================================

alter table formas_pagamento add column infinitepay_metodo text
  check (infinitepay_metodo in ('credit', 'debit'));
comment on column formas_pagamento.infinitepay_metodo is
  'Método correspondente no InfiniteTap: credit, debit ou NULL (forma que não é cartão — dinheiro, Pix, convênio…). Só define o botão "Cobrar no celular"; não muda nada no cálculo nem no caixa. Ver src/lib/infinitepay.js.';
