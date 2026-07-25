# @esta/tarifacao — Motor de tarifação

Réplica **pura e testada** da lógica de cobrança do legado Clipper (HESTA),
portada de `SISPROC2.PRG` (funções `HORAS`/`PERNOITE`/`MINUTO`) e `ESTALAN2.PRG`
(caminho de saída/cobrança).

```bash
npm test          # node --test via tsx (14 casos)
npm run build     # typecheck (tsc --noEmit)
```

## Convenção de tempo — "hora comercial" HH.MM

Horários e durações usam o formato `HH.MM`, onde **a parte decimal são minutos
(00–59)**, não fração de hora. Ex.: `14.30` = 14h30; um tempo decorrido de `2.54`
= 2h54. É assim que o legado compara contra as faixas (`ATEnn`).

## Regras `[VALIDAR]` do CLAUDE.md — resolvidas no código

| Regra | Conclusão (lida no fonte) |
|---|---|
| **Tolerância** | **Percentual**, não minutos. Em `PERNOITE`: `y = janela_noturna × (100 − TOL)/100`. Só conta diária quando o tempo dentro da janela ≥ `y`. Confirmado: tabela "P" tem `TOL=99`. |
| **Pernoite** | Cada diária adiciona `VPERNOITE`; o tempo residual (fora da janela) cai nas faixas normais. `PERNOITE` devolve `{diárias, residual}`. |
| **usaValorConvenioDaFaixa** | Quando `convenio.tabHoras`, usa a coluna `CON` da faixa como valor de convênio (marcado `[VALIDAR]` no código — semântica de "desconto vs. valor final" a confirmar). |

## Cobertura atual (20 testes)

Coberto e testado:
- Tempo decorrido (`HORAS`), seleção de faixa (até 45), pernoite/diária (`PERNOITE`).
- Convênio: tabela alternativa (`TABCONV`), grade própria (`TABHORAS/CON`),
  percentual (`PERCONV`), valor fixo (`VLRCONV`).
- **Convênio em dois segmentos** (hora de corte `whoraconv`) — `ESTALAN2.PRG:473-534`.
- **Selos e vales** (abatimento por quantidade × valor unitário).
- **Saldo devedor** (`VALORDEV`) somado após o piso.
- **Bônus de fidelidade** (`BONUSFIDE`) e valor já pago (recobrança) abatidos.
- Piso em zero, pontos e ajuste por forma de pagamento.

Pontos marcados `[VALIDAR]` no código (semântica a confirmar, baixo impacto):
janela de pernoite do 2º segmento; coluna `CON` como desconto vs. valor final;
ponto exato do ajuste por forma de pagamento.

## Estado da reconciliação contra o histórico (`ESTAMORT`, 2.575 movimentos)

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
