# Sem Parar — pagamento por placa

Integração com a API do Sem Parar pra estacionamentos informatizados (sem
cancela). Baseado no "Manual de Integração — Sistemas Informatizados" v03.02.

## O que faz hoje

1. **Entrada**: o esta chama o método **Autoriza** do Sem Parar perguntando
   se aquela placa pode pagar por lá neste estabelecimento. Best-effort — não
   trava a entrada nem o ticket, e sem Sem Parar ligado na filial nem chega a
   disparar.
2. **Pátio**: veículo autorizado ganha uma marcação (🅿️) do lado da placa, na
   lista de quem está no pátio.
3. **Saída**: se autorizado, a forma **"Sem Parar"** (Cadastros → Formas de
   pagamento) aparece marcada (🅿️) no seletor de pagamento — mas **só roda o
   fluxo de cobrança (Recebe + Confirma) se o operador escolher essa forma
   explicitamente**. Escolhendo qualquer outra forma, o Sem Parar
   simplesmente não é usado.

Decisão do Eduardo: nada de cobrança automática nem tela de confirmação com
contagem regressiva (o manual descreve os modos "Automático" e
"Semiautomático" — o esta não implementa nenhum dos dois ao pé da letra;
é sempre o operador escolhendo, como qualquer outra forma de pagamento).

## Por que não tem Cancela nem Status (ainda)

- **Cancela**: o manual só permite cancelar uma transação já **confirmada**,
  em até 10 minutos. Como o esta só chama Recebe/Confirma quando o operador
  explicitamente escolhe Sem Parar (nunca antes), não existe "autorização
  não usada" pra cancelar — só existiria se o operador escolhesse Sem Parar,
  confirmasse, e DEPOIS quisesse desfazer. Não implementado nesta fase; fácil
  de adicionar se precisar (um botão "Cancelar Sem Parar" na saída recém-
  confirmada, chamando o método Cancela dentro da janela de 10 min).
- **Status**: o manual pede um heartbeat a cada 15 minutos (vagas
  disponíveis, localização, modo de operação) pra sinalizar que o
  estabelecimento está online. Isso precisa de um cron job (Vercel Cron) e
  não foi pedido nesta rodada — sem ele, o Sem Parar pode considerar o
  estabelecimento "offline" e não rotear clientes pra cá. **Verificar com o
  Sem Parar se isso é bloqueante pra ir ao ar.**

## Configurar

1. **Configurações → Sem Parar** (só fornecedor): marcar "Usa o Sem Parar
   nesta filial" e preencher **Código do estabelecimento** + **Hash** — os
   dois o Sem Parar entrega juntos, por filial.
2. **Variáveis de ambiente do Vercel** (nunca no banco, nunca num chat):
   - `SEMPARAR_API_KEY` — a chave da integradora, **uma só para todos os
     clientes do esta** (dada pelo Sem Parar ao esta como integradora, não
     por filial).
   - `SEMPARAR_BASE_URL` — opcional. Sem ela, usa o ambiente de
     **homologação** (`https://homolog.apisemparar.com.br`), que é a única
     URL que consta no manual. **A URL de produção será fornecida pelo Sem
     Parar depois da homologação do sistema** — quando vier, cadastrar aqui.
3. **Cadastros → Formas de pagamento**: marcar **"É 'Sem Parar'"** na forma
   correspondente (só uma).

## Onde está no código

| Arquivo | O quê |
|---|---|
| [api/semparar-autoriza.js](../api/semparar-autoriza.js) | Chama Autoriza na entrada |
| [api/semparar-saida.js](../api/semparar-saida.js) | Chama Recebe + Confirma na saída (só quando o operador escolhe a forma) |
| [src/lib/tempo.js](../src/lib/tempo.js) (`dataHoraLocalISO`) | Formata data/hora local pro formato do manual (testado) |
| [src/telas/Patio.jsx](../src/telas/Patio.jsx) | Dispara o Autoriza na entrada, badge no pátio, marcação + checagem na saída |
| [src/telas/Configuracoes.jsx](../src/telas/Configuracoes.jsx) | Liga/desliga + código/hash por filial |
| [src/telas/cadastros.jsx](../src/telas/cadastros.jsx) | Campo "É 'Sem Parar'" nas formas de pagamento |
| `0051_semparar.sql` | Colunas em `movimentos`/`formas_pagamento`, `semparar_sequencias`, `proximo_nsu_semparar()` |

A chave da integradora fica só em `SEMPARAR_API_KEY` (env do Vercel) — nunca
no banco nem no navegador. Código do estabelecimento e hash (por filial)
ficam em `filiais.config.semparar` (jsonb).

## NSU

12 caracteres: código do estabelecimento (5 dígitos, zero à esquerda) +
sequencial de 7 dígitos, exatamente como o exemplo do manual (código `12345`
→ primeira NSU `123450000001`; código `1234` → `012340000001`). Gerado por
`proximo_nsu_semparar()`, atômico (não repete mesmo com duas saídas ao mesmo
tempo), testado direto no banco com os dois exemplos do manual.

## Retomando depois de uma falha

Se o **Recebe** funcionar mas o **Confirma** falhar/der timeout (rede caiu no
meio, por exemplo), o movimento fica com `semparar_status = 'recebido'` e o
`transactionID` já salvo. Uma nova tentativa (escolher Sem Parar de novo na
saída) detecta isso e pula direto pro Confirma — **não repete o Recebe**
(evita "NSU já utilizado", código 63). Se o Sem Parar já tinha mesmo
confirmado antes (código 94 = retransmissão), a nova tentativa trata como
sucesso.

## Erros do manual (item 3) já com frase própria

`17` (cliente cancelou pelo app), `59` (token vencido — placa reentra pra
gerar um novo), `93` (token já usado) e os demais códigos ISO8583 do manual
— ver `MOTIVOS` em `api/semparar-saida.js`.
