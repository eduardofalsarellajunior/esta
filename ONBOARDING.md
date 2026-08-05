# Onboarding — esta (retomando o projeto numa conta nova do Claude)

> Leia isto primeiro, depois o [`CLAUDE.md`](CLAUDE.md) (contexto persistente
> completo do projeto — arquitetura, stack, convenções). Este arquivo cobre
> só o que mudou numa sessão recente e que o `CLAUDE.md` ainda não reflete,
> mais os pontos que exigem atenção antes de continuar.

## Como isto foi gerado

O Eduardo está trocando de conta do Claude (comprando o Claude Pro numa
conta nova) no **mesmo computador**. Nada da infraestrutura precisa ser
transferido — o código está no GitHub, o banco no Supabase e o deploy no
Vercel, todos em contas do próprio Eduardo, nunca do Claude. O que não
necessariamente passa de uma conta pra outra é a memória/contexto de
conversa — por isso este resumo.

## Estado real agora (corrige o `CLAUDE.md`, que está com a Fase 4 desatualizada)

O `CLAUDE.md` (seção 8) ainda diz que a Fase 4 (Fiscal) tem "assinatura +
transmissão externas" pendentes. **Isso não é mais verdade.** Nesta sessão:

- **Fiscal (NFS-e) está funcional de ponta a ponta**: geração do DPS,
  assinatura digital (XMLDSig) e transmissão (mTLS) pro webservice de
  **Campinas** — que usa implementação própria (hospedada pela **IMA**),
  não o Sistema Nacional NFS-e (ADN) compartilhado. Já testado com sucesso
  em **homologação**. Ver `docs/STATUS-E-INTEGRACOES.md` (também
  atualizado) e a seção "Detalhes da integração fiscal" abaixo.
- **Importação direta de `.dbf`** do sistema legado (Clipper/DOS): tela
  nova no menu, mensalistas + modelos de veículo + formas de pagamento.
- **Leitura de placa por foto** (Plate Recognizer) no Pátio e no cadastro
  de veículo do mensalista.
- **Recebimento de mensalidade** completo: valor, vencimento fixo,
  tolerância, primeira mensalidade proporcional, botão de recebimento
  acessível também da tela de Pátio (menu ⋮).

## Arquivos novos desde o `CLAUDE.md` (seção 4 do arquivo está incompleta)

```
api/gerar-nfse.js              Vercel Function (Node) — assina e envia o DPS
src/servidor/nfse.js           Assinatura XMLDSig + envio mTLS (só server-side)
src/lib/mensalidade.js         Regras de recebimento de mensalidade
src/lib/importacaoDbf.js       Grava no Supabase o que vem do .dbf importado
src/componentes/ReceberMensalidade.jsx  Fluxo de recebimento (usado em 2 telas)
src/componentes/CardAcoes.jsx  Menu ⋮ genérico (reaproveitável)
src/componentes/CapturaPlaca.jsx  Botão de foto (câmera/arquivo) -> leitura de placa
src/telas/ImportarDbf.jsx      Tela de importação do legado
packages/dbf/                 Parser de .dbf (dBASE III) + mapeamento -> colunas do esta
supabase/functions/ler-placa/  Edge Function (Deno) — proxy pro Plate Recognizer
supabase/migrations/0013 a 0015  mensalidade_recebimento, mensalidade_caixa,
                               mensalista_numero_endereco
```

## Detalhes da integração fiscal (o que mais vale saber antes de tocar em `fiscal.js`/`nfse.js`)

- **Endpoint**: Campinas usa `https://preprod-nfse.ima.sp.gov.br/.../adn/dps`
  (homologação) e `https://novanfse.campinas.sp.gov.br/.../adn/dps`
  (produção) — **não** o `sefin.nfse.gov.br` nacional. Configurado em
  `src/servidor/nfse.js` (`URL_POR_AMBIENTE`).
- **Assinatura**: XMLDSig enveloped, C14N padrão, **RSA-SHA1/SHA1** (não
  SHA-256 — tentei SHA-256 por suposição, causou E0714, revertido) e
  **EndCertOnly** (só o certificado do titular no `KeyInfo`, nunca a cadeia
  da AC — também tentei incluir a cadeia, causou E0714, revertido).
- **Certificado**: `.pfx` do Eduardo, guardado em base64 nas Environment
  Variables do Vercel (`NFSE_CERTIFICADO_PFX_B64` + `NFSE_CERTIFICADO_SENHA`).
  `.pfx` reais costumam ter cadeia (titular + AC) — o código escolhe o
  certificado certo comparando o módulo RSA com a chave privada.
- **Ambiente**: `Configurações → Fiscal → Ambiente de envio`
  (homologação/produção), guardado em `filiais.config.nfse.ambiente`. Só
  mudar pra produção depois de validar em homologação — é ponto sem volta.
- **Documentação pública é fragmentada** — quase todo o esquema do XML
  (`gerarXmlDPS` em `src/lib/fiscal.js`) foi acertado por tentativa e erro,
  lendo os retornos de erro da ADN/IMA um por um (ver o histórico de commits
  "Fiscal: ..." — cada um resolve um erro específico, útil se precisar
  depurar algo parecido de novo).

## Pendências conhecidas

- Testar em **homologação** com tomador identificado (CPF/CNPJ preenchido)
  — só testamos o caminho "sem documento" (`cNaoNIF`).
- Confirmar se o código de tributação nacional/municipal e o regime
  tributário (`Configurações → Fiscal`) foram revisados pelo contador do
  Eduardo — são classificações fiscais reais, não valores adivinhados pelo
  código.
- Antes de virar produção: mais alguns testes de valores/cenários
  diferentes em homologação.
- Papel de usuário "Fornecedor" (dono do SaaS, acima de supervisor) — foi
  discutido mas não implementado. Precisaria de RLS especial em `filiais`
  (hoje só bloqueia por filial, não por papel) e possivelmente um trigger
  pra restringir campos específicos, já que RLS não restringe por coluna.
- Publicação na Play Store (TWA) — ainda não iniciada, só foi levantado
  custo (~US$25 único da conta + ~US$45/mês Vercel Pro + Supabase Pro pra
  operação comercial multi-tenant, servindo todos os clientes com uma
  infra só — não uma cópia por cliente).

## Como continuar

```bash
cd C:\Users\Du\Documents\GitHub\esta\esta
npm install     # se for uma instalação nova
npm run dev     # PDV em http://localhost:5174
npm test        # motor de tarifação + parser dbf + mapeamento
npm run build
```

`.env.local` e `.claude/settings.local.json` já estão no disco desta
máquina (são locais, fora do git) — não precisam ser recriados.

**Convenções que valem repetir** (já estão no `CLAUDE.md`, mas são as que
mais importam): commits em português, `Co-Authored-By: Claude ... ` nas
mensagens; confirmar com o Eduardo antes de `git push` pra `main` (deploy
automático); nunca pedir senha/certificado/chave direto no chat — ele
sempre digita em Environment Variables do Vercel/Supabase, nunca aqui.
