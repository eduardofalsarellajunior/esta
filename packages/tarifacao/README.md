# @esta/tarifacao — Motor de tarifação

Réplica **pura e testada** da lógica de cobrança do legado Clipper (HESTA),
portada de `SISPROC2.PRG` (funções `HORAS`/`MINUTO`) e `ESTALAN2.PRG`
(caminho de saída/cobrança).

```bash
npm test          # node --test via tsx (38 casos)
npm run build     # typecheck (tsc --noEmit)
```

## Convenção de tempo — "hora comercial" HH.MM

Horários e durações usam o formato `HH.MM`, onde **a parte decimal são minutos
(00–59)**, não fração de hora. Ex.: `14.30` = 14h30; um tempo decorrido de `2.54`
= 2h54. É assim que o legado compara contra as faixas (`ATEnn`).

## Regras `[VALIDAR]` do CLAUDE.md — resolvidas no código

| Regra | Conclusão (lida no fonte) |
|---|---|
| **usaValorConvenioDaFaixa** | Quando `convenio.tabHoras`, usa a coluna `CON` da faixa como valor de convênio (marcado `[VALIDAR]` no código — semântica de "desconto vs. valor final" a confirmar). |

> Pernoite/diária e tolerância (janela noturna) foram **removidos** do motor —
> não eram usados na operação real. Ver histórico do reconciliação abaixo, que
> foi feito quando essa lógica ainda existia.

## Faixas: fixo ou por hora

Cada faixa (`tabela_preco_faixas`) tem um `tipo_cobranca`: **'fixo'** (padrão —
valor cheio da faixa, como sempre foi) ou **'hora'** (o valor vira uma taxa por
hora, cobrada cumulativamente a partir do teto da faixa anterior, com fração de
hora arredondada pra cima). Implementado em `calcularValorFaixas`.

Exemplo (validado com o Eduardo): até 0:30 fixo R$8; até 1:05 fixo R$10; até
12:05 hora R$5; até 99999:00 hora R$3.

| Tempo decorrido | Cálculo | Valor |
|---|---|---|
| 0:25 | cai na 1ª faixa (fixo) | R$8,00 |
| 1:03 | cai na 2ª faixa (fixo) — não soma com a 1ª | R$10,00 |
| 2:35 | R$10 (base) + 2h×R$5 (1:05→2:35, arred. pra cima) | R$20,00 |
| 15:20 | R$10 + 11h×R$5 (faixa 3 inteira) + 4h×R$3 (3:15 arred.) | R$77,00 |

Regra: faixas "fixo" **substituem** o total acumulado (não somam entre si);
faixas "hora" **somam** ao total, cada uma cobrando apenas o intervalo desde o
teto da faixa anterior. Faixas 100% "fixo" (todas as tabelas hoje) se
comportam exatamente como antes — o `tipo_cobranca` nasce `'fixo'` em todas
por padrão, então nenhuma tabela existente muda de valor sozinha.

Faixa "hora" cobra por **período**, não necessariamente por hora cheia: o
campo `periodo` (HH.MM) define o tamanho do bloco — `1.00` = 1h (padrão),
`0.30` = 30min, `24.00` = uma diária. Fração de período conta como um período
inteiro (mesmo arredondamento pra cima de antes). `periodo` ausente ou zero
cai no padrão de 1h, preservando o comportamento das faixas cadastradas antes
desta opção existir.

A grade de convênio (coluna CON, usada quando `convenio.tabHoras=true`) segue a
**mesma** regra: percorre as faixas com `calcularValorFaixas(faixas, tempo,
'con')`, somando por hora nas faixas `'hora'` e substituindo o total nas
`'fixo'`. Um CON zerado numa faixa `'hora'` não acrescenta nada ao valor achado
até ali — é como se aquele trecho fosse por conta do cliente.

As duas colunas saem sempre da **mesma faixa**, então o que o cliente paga é
`HOR − CON` com piso em zero, e `CON` é o que fica a pagar pelo convênio.

## Faixa "valor": sem número configurado, pergunta na saída

Uma terceira opção de `tipo_cobranca`: **'valor'**. Sem `hor` pré-configurado
— quem decide quanto cobrar é o operador, na hora da saída (ver "Alterar
valor" em `src/telas/Patio.jsx`, que abre sozinho quando isso acontece).

No motor, assim que `calcularValorFaixas` alcança uma faixa `'valor'` **na
coluna `hor`** — seja ela a que bate ou uma que o tempo decorrido já
ultrapassou a caminho de uma faixa seguinte — a função curto-circuita e
devolve `pedeValor: true` (com `valor: 0`, que a UI substitui pelo que o
operador digitar). Não dá pra saber quanto essa faixa "contribuiria" pro
total sem essa entrada, então a resposta é sempre perguntar, nunca assumir
zero silenciosamente. `pedeValor` propaga por `calcularProporcional` e pelos
três caminhos de `calcularTarifa` (proporcional simples, soma de serviços,
dois segmentos de convênio) até o `ResultadoTarifa` final.

Na coluna `con` (grade de convênio), uma faixa `'valor'` vale `0` sem pedir
nada — pedir um valor de convênio no meio do fluxo de saída é outra frente,
fora de escopo por ora.

## Serviços: soma de tabelas

Quando `servicosTipos` (lista de códigos de tabela) vem preenchida, o valor
proporcional vira a **soma** do valor de cada uma dessas tabelas — calculadas
sobre o mesmo tempo decorrido — em vez do valor da tabela do veículo
(`tipoVeic`). O resto do pipeline (convênio, selos, vales, piso) segue igual,
operando sobre esse total somado. Usado quando o operador marca serviços
(lavagem, polimento etc.) no veículo — cada serviço tem sua própria tabela de
preço (cadastro "Serviços"), e a saída cobra a soma delas.

## Cobertura atual (24 testes)

Coberto e testado:
- Tempo decorrido (`HORAS`), seleção de faixa (até 45).
- Faixas fixo/hora (`calcularValorFaixas`) — 4 testes com o exemplo acima.
- Serviços: soma de tabelas (`servicosTipos`).
- Convênio: tabela alternativa (`TABCONV`), grade própria (`TABHORAS/CON`),
  percentual (`PERCONV`), valor fixo (`VLRCONV`).
- **Convênio em dois segmentos** (hora de corte `whoraconv`) — `ESTALAN2.PRG:473-534`.
- **Selos e vales** (abatimento por quantidade × valor unitário).
- **Saldo devedor** (`VALORDEV`) somado após o piso.
- **Bônus de fidelidade** (`BONUSFIDE`) e valor já pago (recobrança) abatidos.
- Piso em zero, pontos e ajuste por forma de pagamento.

Pontos marcados `[VALIDAR]` no código (semântica a confirmar, baixo impacto):
coluna `CON` como desconto vs. valor final; ponto exato do ajuste por forma
de pagamento.

## Estado da reconciliação contra o histórico (`ESTAMORT`, 2.575 movimentos)

> Feita quando o motor ainda tinha pernoite/diária (removidos depois, por não
> serem usados na operação real) — os números abaixo (87,4%) são um retrato
> daquela época, não necessariamente reproduzíveis rodando o motor atual.

⚠️ **Reconciliação valor-a-valor automática NÃO é possível com os arquivos
atuais** — e isso é uma limitação de **dados**, não do motor:

- A tabela `ESTAHORA.DBF` preservada no backup **não corresponde** aos preços
  efetivamente cobrados no histórico. Evidência: os valores dominantes cobrados
  (**R$13** em 2023, **R$12** em 2026 para a classe "P") **não existem** como
  faixa na tabela do snapshot (que tem 5/10/15). As grades de preço vigentes em
  cada época não foram salvas.
- Há estrutura de tempo coerente nos dados (o valor cresce com a duração), o que
  é consistente com o algoritmo — mas sem a tabela da época não dá para casar
  centavo a centavo.

### Reconciliação por tabela recuperada dos dados

Como as grades da época não foram preservadas, recuperamos a **tarifa efetiva
direto do histórico** (bucket de tempo → valor cobrado, por classe). O resultado
é um degrau simples e coerente — ex.: classe "P" em 2023: `≤30min→R$5`,
`≤1h→R$8`, `R$13` fixo de 1h a ~12h (diária), múltiplos para pernoite.

Rodando o motor com essa tabela recuperada sobre os movimentos `P/2023` de
mesmo-dia: **723/827 = 87,4% de acerto exato**. As divergências são explicáveis
(tarifas dobradas por perda de ticket, tier de longa permanência, diárias/
pernoite) — **validam a lógica de tempo do motor**; não são erro de cálculo.

Para chegar a ~100% contra produção, bastaria a grade `ESTAHORA` **como estava
nas datas** dos movimentos. O arnês de reconciliação (Python, lê os `.DBF` e roda
este motor) está pronto para reprocessar quando/se essa grade aparecer.
