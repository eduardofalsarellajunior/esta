# CLAUDE.md — esta (Modernização do Sistema de Estacionamento)

> Arquivo de contexto persistente para o Claude Code.
> Leia este arquivo antes de qualquer alteração. Ele descreve o objetivo, a
> arquitetura, as decisões já tomadas e o estado atual do projeto.

---

## 1. Visão geral do projeto

**esta** é a **modernização de um sistema legado de estacionamento** (originalmente
do pai do Eduardo), escrito em **Clipper/DOS com arquivos DBF**, para uma
**plataforma web + app móvel**.

- **Repositório:** `eduardofalsarellajunior/esta`
- **Natureza real do legado:** não é um simples "controlador de pátio" — é um
  **ERP completo de operação de estacionamento**: ~**94.500 linhas** de Clipper em
  **182 fontes `.PRG`**, com módulos operacional, fiscal, financeiro e de fidelidade.
- **Estratégia de migração:** **incremental (Strangler Fig)**, NÃO "big bang".
  Começar pelo núcleo operacional (entrada/saída/tarifação), que é o que gera caixa.

### Módulos do legado (mapeados)
| Prefixo | Domínio |
|---------|---------|
| `ESTA*` | Operação do estacionamento (núcleo) |
| `SIS*`  | Infraestrutura do sistema |
| `RPS*`  | Fiscal / NFS-e |
| `CRC*`  | Contas a receber |
| `CPG*`  | Contas a pagar |
| `BAN*`  | Banco / fluxo de caixa |
| —       | Trilhas de auditoria |

---

## 2. Stack técnica

| Camada         | Tecnologia                          |
|----------------|-------------------------------------|
| Front-end / PDV| **React 18 + Vite 5** (PWA)         |
| Backend/dados  | **Supabase** (Postgres + Auth + RLS + Realtime) |
| Hospedagem     | **Vercel**                          |
| App móvel      | PWA responsivo → React Native/Expo se precisar de nativo (câmera/LPR, push) |
| Testes         | `node --test` via `tsx`             |

> Cuidados do Vite: config em `vite.config.js`, `index.html` na raiz, variáveis
> com prefixo `VITE_` via `import.meta.env`.

---

## 3. Decisões de arquitetura já tomadas (confirmadas pelo Eduardo)

1. **Multi-tenant desde o dia 1.** Opera com **1 filial** inicialmente, mas com
   `filial_id` em toda tabela operacional + **RLS** isolando por filial (função
   auxiliar `filial_do_usuario()`). Preparado para escalar a SaaS/multi-pátio sem
   refatorar.
2. **Módulos financeiros no escopo** (contas a pagar/receber e banco — ex-`CRC*` /
   `CPG*` / `BAN*`): paridade obrigatória com o legado.
3. **Todas as funcionalidades futuras aprovadas:**
   - Pagamento **Pix/cartão** + **app do cliente**;
   - **LPR** (reconhecimento de placa);
   - integração com **cancela/hardware**;
   - **BI em tempo real**.
4. **Operação ONLINE (não offline-first).** ⚠️ Decisão importante: o Eduardo
   **rejeitou** a proposta inicial de "offline-first", pois os estabelecimentos têm
   internet. O modelo é:
   - o **PWA no navegador fica sempre online e simples**;
   - a contingência para quedas curtas de internet fica num **agente local na
     cabine**, com um **buffer leve** ("para-quedas");
   - esse agente também faz a **ponte com o hardware** (cancela, impressora,
     câmera), já que o navegador não acessa serial/USB de forma confiável.
   - Este é o desenho "Opção B" que o Eduardo escolheu.

---

## 4. Modelo de dados (Supabase) — já projetado

Foi produzido um par de migrations que estabelece o modelo multi-tenant completo do
núcleo:

- **`0001_core_schema.sql`** — tabelas: `filiais`, `perfis` (via Supabase Auth),
  `tabelas_preco` + `tabela_preco_faixas` (normalizado a partir da estrutura plana
  do `ESTAHORA`), `modelos_veiculo`, `convenios`, `mensalistas` +
  `mensalista_veiculos` (removendo o **limite legado de 3 placas** → agora 1:N) +
  `mensalidades`, `formas_pagamento`, `vagas` (com *delay* de reuso via
  `liberavel_em`), e `movimentos` como **log append-only** com índice único que
  impede entrada dupla para a mesma placa (no máximo 1 carro aberto por placa).
- **`0002_rls.sql`** — Row-Level Security isolando tudo por `filial_id`.

> ⚠️ **Estado:** o schema foi **projetado e entregue**, mas confirmar se já foi
> aplicado no Supabase deste projeto. (Diferente do Comercial-INEPAD, aqui a
> aplicação do SQL ainda precisa ser verificada.)

---

## 5. Motor de tarifação (peça mais crítica)

- **`packages/tarifacao/tarifacao.ts`** — função **pura, sem I/O**, que replica a
  lógica do `ESTAHORA`/`ESTALANC`:
  `tempo decorrido → tolerância → seleção de faixa (menor ateHoras >= decorrido)
  → excedente (repete última faixa ou pernoite) → convênio (fixo, % ou coluna
  valorConvenio da faixa) → piso em zero → pontos de fidelidade`.
- **`packages/tarifacao/tarifacao.test.ts`** — **15 testes, todos passando**
  (`node --test` via `tsx`).

### ⚠️ Três regras marcadas `[VALIDAR]` no código (semântica INFERIDA, não confirmada)
Devem ser conferidas rodando movimentos históricos reais do `ESTALANC` no motor novo:
1. **Tolerância** — o legado rotula como "%", mas foi modelada como **minutos** de
   carência. Confirmar.
2. **Pernoite** — regra de "aplica valor fixo se cruzar a janela e for maior".
   Confirmar interação com as faixas.
3. **`usaValorConvenioDaFaixa`** — quando o convênio usa a coluna "VALOR CONVENIO"
   da faixa como valor final.

> **Bloqueio conhecido:** a reconciliação contra dados reais está travada porque o
> ZIP enviado continha só os **fontes** (`.PRG`), **não os arquivos `.dbf`** de
> dados. Para validar as 3 regras, é preciso extrair os `.dbf` (encoding **CP850**)
> para tabelas de staging e reconciliar.

---

## 6. Protótipo de PDV (já existe)

- **`pdv-prototipo.jsx`** — fluxo completo de entrada/saída: digitar placa dispara
  detecção de mensalista, atribuição de vaga ou roteamento de saída; a tela de saída
  mostra o **valor recalculado a cada segundo** usando a função real `calcularTarifa`,
  com seletores de convênio e forma de pagamento.
- Design: base grafite + âmbar (linguagem visual de estacionamento), placa no
  **formato Mercosul**, tipografia monoespaçada nos valores.
- ⚠️ **Estado:** usa **dados em memória (seed)** — ainda **não** está ligado ao
  Supabase. Integração é o próximo passo.

---

## 7. Fluxo de trabalho por serviço

| Serviço      | Como funciona |
|--------------|---------------|
| **Código (React/Vite/TS)** | O Claude Code edita local, faz commit e push. |
| **Vercel**   | Deploy automático a cada push na branch `main`. |
| **Supabase** | **Fluxo manual.** O Code **escreve** o SQL / migrations; **não executa**. Eduardo roda no **SQL Editor** do painel. |

### Regras do fluxo Supabase (manual)
- Gerar SQL, **nunca executar**; **explicar em português** antes de entregar.
- Cuidado redobrado com scripts destrutivos e com o motor de tarifação (afeta
  cobrança real de clientes).

---

## 8. Estado atual e próximos passos

**Estado:** arquitetura definida e validada; primeira leva de código produzida
(schema + motor testado + protótipo de PDV). **Ainda não integrado nem versionado
neste repositório** — trazer os arquivos para o repo é pré-requisito para continuar.

**Sequência recomendada:**
1. [ ] Trazer os arquivos já produzidos para dentro do repo `esta` (schema,
   `tarifacao.ts` + testes, protótipo PDV).
2. [ ] Aplicar/verificar o schema (`0001` + `0002`) no Supabase.
3. [ ] **Ligar o PDV ao Supabase** (trocar seed por tabelas reais, com Auth + RLS).
4. [ ] **CRUDs do núcleo** (tabelas de preço, convênios, mensalistas) para o supervisor.
5. [ ] Quando houver os `.dbf`: **reconciliação + carga inicial** e validação das 3
   regras `[VALIDAR]`.

---

## 9. Convenções de trabalho
- **Idioma:** interface e comunicação em **português (pt-BR)**.
- **Commits:** mensagens claras e descritivas, em português.
- **Confirmação:** antes de alterações estruturais ou `git push`, confirmar.
- **Antes de concluir:** garantir que `npm run build` passa e que os testes do
  motor de tarifação seguem verdes.

---

_Última atualização deste contexto: preparado na migração do projeto para o Claude
Code, a partir do histórico de análise do legado e da arquitetura definida._
