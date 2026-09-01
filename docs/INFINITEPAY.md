# InfiniteTap — cobrança de cartão por aproximação no celular

O celular do operador vira a maquininha: o cliente aproxima o cartão no próprio
aparelho, sem leitor separado. Integração oficial da **InfinitePay** (CloudWalk).

## O que é e o que não é

| | |
|---|---|
| **Crédito e débito** | ✅ por aproximação (NFC do celular) |
| **Pix** | ❌ não faz parte desta integração |
| **Custo pra integrar** | Nenhum — só as taxas normais de maquininha |
| **Chave de API / webhook** | Não existe. É só deeplink entre os dois apps |
| **Onde funciona** | Só no **celular** (Android/iOS) com o app da InfinitePay instalado e logado |

## Como funciona hoje no esta (nível 1)

Na saída do pátio, quando a forma de pagamento é cartão, aparece um botão
**"💳 Cobrar R$ X no celular"**. Ele abre o app da InfinitePay **já com o valor,
o método e o parcelamento preenchidos** — o operador só aproxima o cartão.

> ⚠️ **O esta não recebe a confirmação de volta.** Depois de aproximar o cartão,
> o operador volta pro esta e confirma a saída na mão, como sempre fez. O ganho
> aqui é não digitar o valor na maquininha (e não errar de digitar — cobrar
> R$ 45,00 de um ticket de R$ 4,50).

### Por que a volta não é automática

A documentação da InfinitePay manda passar um `result_url` — o deeplink que o
app chama quando termina a transação, devolvendo `nsu`, `aut` e bandeira. O
exemplo dela usa um esquema próprio (`mypocapp://...`), que **só um app nativo
instalado consegue registrar**. O esta é um PWA (site), não tem esquema próprio.

Está em aberto com a InfinitePay (`parcerias@cloudwalk.io`) se o `result_url`
aceita uma URL `https://` comum. Se aceitar, dá pra fechar a saída sozinha —
ver "Nível 2" abaixo. Enquanto não há resposta, o `result_url` **não é enviado**
de propósito: mandar uma URL que o app abriria no navegador poderia tirar o
operador da aba onde a saída está aberta no meio da venda.

## Configurar

1. **Configurações → Cobrança por aproximação (InfiniteTap)** (só o fornecedor):
   marque *"Usa o InfiniteTap nesta filial"*. O *handle* da conta é opcional —
   serve pro app conferir que está logado na conta certa. O CNPJ dessa checagem
   sai do próprio cadastro da filial.
2. **Cadastros → Formas de pagamento**: em cada forma de cartão, marque o campo
   *InfiniteTap* como **Crédito** ou **Débito**. Formas que não são cartão
   (dinheiro, Pix, convênio, devedor) ficam em *"— não é cartão —"*.
3. No celular: instalar o app da **InfinitePay** e logar na conta do
   estacionamento. **No iPhone**, na primeira transação é preciso aceitar os
   termos da Apple (vincula o iCloud do operador à conta do comerciante) — faça
   uma venda de valor baixo antes (dá pra cancelar depois).

## Regras da InfinitePay

- Valor mínimo: **R$ 1,00**.
- Máximo de **12 parcelas**, e **cada parcela precisa ter pelo menos R$ 1,00** —
  R$ 10,00 em 12x é recusado (daria R$ 0,83 por parcela); em 10x passa. O esta
  já limita o seletor de parcelas a partir do valor, não deixa cair nessa.

## Onde está no código

| Arquivo | O quê |
|---|---|
| [src/lib/infinitepay.js](../src/lib/infinitepay.js) | Monta o deeplink, valida valor/parcelas, lê a config da filial |
| [src/lib/infinitepay.test.ts](../src/lib/infinitepay.test.ts) | Testes das regras acima |
| [src/telas/Patio.jsx](../src/telas/Patio.jsx) | Botão na saída (`cobrarNoCelular`) |
| [src/telas/Configuracoes.jsx](../src/telas/Configuracoes.jsx) | Liga/desliga + handle |
| [src/telas/cadastros.jsx](../src/telas/cadastros.jsx) | Campo *InfiniteTap* nas formas de pagamento |
| `0048_infinitepay.sql` | `formas_pagamento.infinitepay_metodo` |

Config da filial fica em `filiais.config.infinitepay` (`{ ativo, handle }`) —
jsonb, sem coluna dedicada.

## Nível 2 — quando/se o retorno automático for possível

Se a InfinitePay confirmar que o `result_url` aceita `https://`, o que falta é
pequeno:

1. Passar `result_url=https://<dominio>/pagamento-retorno` em `linkInfiniteTap`.
2. Uma rota `/pagamento-retorno` que lê `order_id`, `nsu`, `aut`, `card_brand` da
   query e finaliza a saída daquele movimento.
3. Guardar `nsu`/`aut`/`card_brand` junto do pagamento (`movimento_pagamentos`),
   pra conciliação e pra suporte de uma venda específica.

No **Android**, se o esta estiver instalado na tela inicial (PWA), o sistema
entrega esse link direto pro app instalado, não pro navegador — fica igual a um
app nativo. Se exigirem esquema nativo, aí seria preciso um app-ponte (viável no
Android; no iPhone exige conta de desenvolvedor Apple e revisão da App Store).

**Limite que não tem contorno:** não existe API de consulta de transação. Se a
cobrança falhar no meio (celular travou, app fechado antes de voltar), o esta
não tem como perguntar "essa cobrança passou?" — a conferência é sempre no app
da InfinitePay.
