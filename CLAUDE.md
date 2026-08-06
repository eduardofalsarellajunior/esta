# CLAUDE.md — esta (Modernização do Sistema de Estacionamento)

> Arquivo de contexto persistente para o Claude Code. Leia antes de qualquer
> alteração. Descreve objetivo, arquitetura, estado atual e como subir o projeto.
>
> **Última atualização:** build autônomo das Fases 1–5 concluído; app funcional
> versionado no GitHub. Fase 6 depende de terceiros (ver §9).

---

## 1. Visão geral

**esta** é a modernização de um **ERP de estacionamento** legado (do pai do Eduardo),
originalmente em **Clipper/DOS com arquivos DBF** (~94.500 linhas em 182 fontes
`.PRG`), para **web (PWA) + Supabase**. Não é só "controlar o pátio": tem operação,
fiscal (NFS-e), financeiro e fidelidade.

- **Repositório:** `eduardofalsarellajunior/esta` (branch `main`).
- **Estratégia:** migração incremental **Strangler Fig**, começando pelo núcleo que
  gera caixa (entrada/saída/tarifação).
- **Filial de exemplo:** Falsarella e Scarpini (Campinas-SP), id fixo
  `00000000-0000-0000-0000-0000000000f1`.

### Módulos do legado (mapeados)
| Prefixo | Domínio |
|---------|---------|
| `ESTA*` (127) | Operação (núcleo) |
| `SIS*` (15) | Infraestrutura/menu/parâmetros |
| `RPS*`/`ESTARPS*` | Fiscal (NFS-e — Campinas, Padrão Nacional/ABRASF/DSF) |
| `CRC*` (15) | Contas a receber |
| `CPG*` (10) | Contas a pagar |
| `BAN*` (7) | Banco / fluxo de caixa |

> Detalhe completo em [docs/ANALISE-E-ARQUITETURA.md](docs/ANALISE-E-ARQUITETURA.md)
> e status por fase em [docs/STATUS-E-INTEGRACOES.md](docs/STATUS-E-INTEGRACOES.md).

---

## 2. Subir o projeto em uma máquina nova

O banco (Supabase) é **em nuvem** — não depende da máquina. Trocar de computador
significa só clonar o repo e reconfigurar as chaves locais.

```bash
git clone https://github.com/eduardofalsarellajunior/esta.git
cd esta
npm install
# criar .env.local a partir de .env.example e preencher com as chaves do Supabase
npm run dev          # PDV em http://localhost:5174
npm test             # testes do motor de tarifação (20)
npm run build        # build de produção (Vite)
```

**Pré-requisitos:** Node 24+, git.

**`.env.local`** (NÃO versionado — recriar em cada máquina):
```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-publica
```
(Supabase → Project Settings → API.)

**O que NÃO vem pelo git** (recriar/obter à parte):
- `.env.local` — as chaves.
- `supabase/seed/local/seed_cadastros.sql` — seed com **dados pessoais** de
  mensalistas/clientes (gitignored). Os dados já estão no Supabase; só é preciso se
  quiser recarregar. Gerado a partir dos DBFs.
- Os `.zip`/`.dbf` do legado (ficam em `Downloads/` na máquina antiga) — necessários
  só para **regenerar seeds**. O seed de referência já está versionado.

---

## 3. Stack

| Camada | Tecnologia |
|--------|------------|
| Front-end / PDV | **React 18 + Vite 5** (PWA), `react-router-dom` |
| Backend/dados | **Supabase** (Postgres + Auth + RLS + Realtime) |
| Hospedagem | **Vercel** (deploy no push da `main`) |
| App móvel | PWA responsivo → React Native/Expo se precisar nativo (LPR/push) |
| Agente de cabine | Serviço local (ponte serial/USB + buffer offline) — Fase 6 |
| Testes | `node --test` via `tsx` |

> Vite: config em `vite.config.js` (porta **5174**, para não conflitar com outro app
> local na 5173), `index.html` na raiz, variáveis `VITE_` via `import.meta.env`.

---

## 4. Estrutura do repositório

```
packages/tarifacao/      Motor de tarifação (puro, testado) — o coração
  tarifacao.ts           HORAS/PERNOITE/faixas/convênio/pernoite/selos/…
  tarifacao.test.ts      20 testes
  README.md              Semântica + estado da reconciliação
src/
  App.jsx                Auth gate + roteamento
  main.jsx, styles.css
  componentes/
    Layout.jsx           Navegação lateral
    Crud.jsx             CRUD genérico (base dos cadastros)
  lib/
    supabase.js          Cliente Supabase (env)
    dados.js             Carregadores (tabelas de preço, pátio) + mapeamento p/ motor
    tempo.js             Hora comercial HH.MM, formatadores
    fiscal.js            Geração de XML DPS (Padrão Nacional) + numeração RPS
  telas/
    Patio.jsx            Entrada (detecta mensalista/convênio) + saída (cálculo real, split pagto, fidelidade)
    Caixa.jsx            Abertura/sangria/fechamento por operador
    BI.jsx               Painel de KPIs em tempo real
    Precos.jsx           Tabelas de preço + faixas (1:N)
    cadastros.jsx        Convênios, Formas, Vagas, Modelos, Mensalistas
    financeiro.jsx       Receber (ponte mensalidade→título), Pagar, Banco
    Fiscal.jsx           Geração de RPS/NFS-e
supabase/
  migrations/            0001 núcleo · 0002 RLS · 0003 caixa · 0004 financeiro · 0005 fiscal
  seed/
    seed_referencia.sql  Seed sem PII (versionado)
    local/               Seed com PII (gitignored)
    README.md
docs/                    ANALISE-E-ARQUITETURA.md · STATUS-E-INTEGRACOES.md
```

---

## 5. Banco de dados (Supabase) — migrations e seeds

Modelo **multi-tenant** (tudo com `filial_id` + **RLS** isolando por filial via
`filial_do_usuario()`). Domínio `hora_comercial` (HH.MM) alinhado ao motor.

**Ordem de aplicação no SQL Editor:**
```
0001_core_schema.sql   núcleo (filiais, perfis, tabelas_preco+faixas, convenios,
                       mensalistas+veiculos+mensalidades, formas_pagamento, vagas,
                       clientes, movimentos+movimento_pagamentos, modelos_veiculo)
0002_rls.sql           RLS por filial
0003_caixa.sql         caixas, sangrias, movimentos.caixa_id
0004_financeiro.sql    fornecedores, contas_bancarias, titulos_receber/pagar, lancamentos_banco
0005_fiscal.sql        notas_fiscais, fiscal_sequencias
--- seeds ---
seed/seed_referencia.sql       filial + preços + convênios + formas + modelos
seed/local/seed_cadastros.sql  mensalistas + clientes (PII, à parte)
```
**Estado:** `0001`/`0002` e o seed de referência **aplicados**. `0003`–`0005`:
confirmar se já foram aplicados na nuvem (necessários para Caixa/Financeiro/Fiscal).

### Regras do fluxo Supabase
- **Desde 2026-08-05:** o Eduardo optou por dar ao Code **acesso direto (leitura e
  escrita)** à base, via MCP oficial da Supabase (`@supabase/mcp-server-supabase`),
  configurado por máquina com um Personal Access Token (não vem pelo git — precisa
  ser registrado de novo em cada máquina nova, ver instruções de conexão dadas na
  sessão em que essa decisão foi tomada).
- **Se o MCP não estiver conectado nesta sessão** (ex.: máquina nova, token não
  configurado ainda): volta ao fluxo manual — o Code escreve SQL/migrations e
  explica em português; o Eduardo roda no SQL Editor.
- **Mesmo com acesso direto**, cuidado redobrado com scripts destrutivos e com o
  motor de tarifação (afeta cobrança real): confirmar com o Eduardo antes de rodar
  qualquer coisa destrutiva ou alteração em produção, mesmo tendo a capacidade
  técnica de executar direto.
- Para criar um usuário do app: criar em *Authentication* e inserir em `perfis`
  (`id` do usuário, `filial_id` da filial, `papel` = `supervisor`/`operador`).

---

## 6. Motor de tarifação (peça mais crítica) — DECODIFICADO

`packages/tarifacao/tarifacao.ts` replica fielmente `SISPROC2.PRG` (HORAS/PERNOITE/
MINUTO) e `ESTALAN2.PRG` (saída). **20 testes verdes.**

- **Hora comercial `HH.MM`**: `14.30` = 14h30 (decimal = MINUTOS, não fração).
- **Tolerância = PERCENTUAL** (não minutos): `y = janela_noturna × (100−TOL)/100`.
- **Pernoite**: `{diárias, residual}`; valor = faixa(residual) + diárias×`valor_diaria`.
- Até 45 faixas; convênio (tabela alt./grade CON/percentual/valor fixo); **2 segmentos**
  (hora de corte); selos/vales; saldo devedor; bônus fidelidade; piso em zero.

### Reconciliação contra dados reais
Os DBFs reais existem (em `Downloads/hesta3.zip → filial01.zip`); `ESTAMORT.DBF` tem
**2.575 movimentos**. ⚠️ A tabela de preço da época **não foi preservada** no backup,
então a reconciliação valor-a-valor usa a **tarifa recuperada dos dados** (87,4% de
acerto exato em P/2023 mesmo-dia). O motor está correto; o resto é explicável
(tarifa dobrada por perda de ticket, tiers, pernoite). Ver `packages/tarifacao/README.md`.

---

## 7. Decisões de arquitetura (confirmadas)

1. **Multi-tenant desde o dia 1** (1 filial hoje; SaaS depois), `filial_id` + RLS.
2. **Financeiro no escopo** — mas **reescrito limpo**: o legado (CRC/CPG/BAN) é código
   herdado de um sistema escolar e **não tem ponte automática** com o operacional.
   O novo tem a ponte real: mensalidade/convênio → título a receber.
3. **Operação ONLINE** (não offline-first): PWA sempre online; contingência de quedas
   e ponte de hardware ficam num **agente local na cabine** ("Opção B").
4. Funcionalidades futuras aprovadas: Pix/cartão, app do cliente, LPR, cancela, BI.

---

## 8. Estado por fase

| Fase | Entrega | Estado |
|------|---------|--------|
| 1 — Motor | pacote puro + testes + reconciliação | ✅ funcional |
| 2 — PDV | login, pátio (mensalista/convênio/pagamento/fidelidade), CRUDs | ✅ funcional |
| 3 — Caixa + BI | abertura/sangria/fechamento, painel tempo real | ✅ funcional (após 0003) |
| 5 — Financeiro | receber/pagar/banco + ponte mensalidade→título | ✅ funcional (após 0004) |
| 4 — Fiscal | geração RPS/NFS-e (Padrão Nacional) + XML | ⚠️ geração ok (após 0005); assinatura+transmissão externas |
| 6 — Integrações | Pix/cartão, app cliente, LPR, cancela | ⛔ dependem de terceiros |

---

## 9. Fase 6 — pendências externas (ver docs/STATUS-E-INTEGRACOES.md)

- **Pix/cartão automático**: conta em PSP + webhook (registrar manualmente já funciona).
- **App do cliente**: definição de autenticação do cliente (dados pessoais).
- **LPR**: câmera + agente local (reconhecimento de placa).
- **Cancela/impressora/serial**: agente local na cabine + hardware.

---

## 10. Convenções de trabalho

- **Idioma:** pt-BR na interface e comunicação.
- **Commits:** mensagens claras em português; terminar com `Co-Authored-By: Claude…`.
- **Push:** `main` → deploy automático na Vercel (configurar as `VITE_*` também nas
  Environment Variables da Vercel). Confirmar antes de push, salvo autorização explícita.
- **Antes de concluir:** garantir `npm run build` (Vite) e `npm test` (motor) verdes.
- **Windows/CRLF:** o git avisa sobre normalização LF→CRLF — inofensivo.
- **GitHub/Vercel:** o Code pode ter `gh` CLI e `vercel` CLI autenticados localmente
  (configuração por máquina, não vem pelo git) para consultar PRs/issues/Actions e
  deploys/logs diretamente. Push pra `main` continua exigindo confirmação antes,
  mesmo com CLI conectada — ver regra de Supabase (§5) para o mesmo princípio
  aplicado ao banco.
