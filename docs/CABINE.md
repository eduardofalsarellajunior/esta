# Máquina da cabine — impressão direta do ticket

Como deixar o PDV imprimindo o ticket **sem o diálogo de impressão**, e sem que
isso contamine o navegador que o supervisor usa no dia a dia.

## O atalho

[`scripts/pdv-cabine.bat`](../scripts/pdv-cabine.bat) abre o app assim:

```
chrome.exe --app=<url> --kiosk-printing --user-data-dir=%LOCALAPPDATA%\esta-pdv
```

| Flag | O que faz |
|------|-----------|
| `--app=` | Janela de aplicativo: sem barra de endereço, sem abas. |
| `--kiosk-printing` | `window.print()` vai direto pra impressora padrão, sem diálogo. |
| `--user-data-dir=` | Perfil separado — é o que confina as duas flags acima a esta janela. |
| `--disable-popup-blocking` | Sem isso, os pedidos de impressão vindos do celular (que chegam por uma verificação em segundo plano, sem clique) ficam bloqueados pelo Chrome — pop-up sem gesto do usuário é barrado por padrão, mesmo neste perfil. |

Rodar sem argumento abre a produção; passando uma URL (`pdv-cabine.bat
http://localhost:5174`) dá pra testar o mesmo comportamento no dev.

## Chrome pedindo login (tela de escolher conta) — use o Edge

Em máquina de cliente, às vezes o Chrome já instalado tem alguma política
corporativa de login obrigatório (`BrowserSignin` forçado — comum em máquina
que veio com Chrome de uma instalação/gerenciamento anterior). Isso trava até
um perfil novo (`--user-data-dir`, o que o `.bat` usa) na tela de escolher
conta assim que abre — o `--no-first-run` não sobrepõe essa política, e o
modo kiosk não funciona (a janela que abre é a de login, não o app).

Solução: [`scripts/pdv-cabine-edge.bat`](../scripts/pdv-cabine-edge.bat) é o
mesmo script, mas abre o **Microsoft Edge** em vez do Chrome — é Chromium por
baixo, aceita as mesmas flags de linha de comando, e por ser outro executável
não cai na mesma política do Chrome daquela máquina. Todo o resto deste
documento (checklist, impressora padrão, impressão puxando do celular) vale
igual pro Edge.

## Por que não dá pra ligar/desligar pelo app

`--kiosk-printing` é lida **na subida do processo do Chrome** e vale enquanto
aquele perfil estiver aberto. Nenhum código da página — nem `window.print()`,
nem service worker, nem a PWA instalada — liga ou desliga isso.

Daí o perfil separado: sem ele, a flag no atalho normal do Chrome faria
*qualquer* site imprimir em silêncio. Com ele, fechou a janela do PDV, acabou.

## Checklist da máquina

1. A impressora do ticket precisa estar como **padrão do Windows** — no modo
   kiosk não há escolha de impressora. Em *Configurações → Bluetooth e
   dispositivos → Impressoras e scanners*, desligue **"Permitir que o Windows
   gerencie minha impressora padrão"** — com isso ligado, o Windows troca a
   padrão sozinho pra qualquer impressora usada por outro app, sem avisar
   (foi exatamente o que aconteceu numa filial: o ticket começou a sair numa
   HP LaserJet do escritório em vez da térmica).
2. Faça o login do operador uma vez na janela do PDV; o perfil guarda a sessão.
3. Se o ticket sair com margens/cabeçalho do navegador, ajuste em
   *Configurações de impressão* daquele perfil (o kiosk usa as últimas
   preferências salvas dali).
4. Colocar o `.bat` na pasta de inicialização (`shell:startup`) deixa o PDV
   subindo sozinho quando a máquina liga.
5. Se a janela do PDV já estava aberta quando o `.bat` foi atualizado (ex.:
   pra ganhar o `--disable-popup-blocking`), feche e abra de novo — flag de
   linha de comando só vale a partir da próxima vez que o Chrome sobe.

## Ticket sai sem formatação (tudo em texto puro)

Quase sempre é o **driver da impressora**: instalada como **"Genérica / Somente
texto"**, ela recebe só caracteres e ignora o que o navegador desenhou —
negrito, fonte grande (`@PG+@`), alinhamento, tudo se perde. É comum a
impressora vir assim numa máquina que rodava o sistema antigo (o Clipper
mandava texto cru direto pra porta).

Solução: reinstalar a impressora com o **driver do fabricante** (Epson,
Elgin, Bematech, Daruma…), não com o genérico. Depois de trocar, imprima uma
página de teste do Windows antes de testar pelo app.

## Diagnóstico: celular manda, cabine não imprime

Do mais provável pro menos, o que checar na máquina da cabine:

1. **A janela da cabine está aberta?** O "servidor" de impressão é a própria
   aba — fechou, os pedidos ficam pendentes.
2. **A opção está ligada NA JANELA DO `.bat`?** *Configurações → Aparência →
   "Este navegador imprime os pedidos vindos do celular"*. Esta é a pegadinha
   que já custou uma instalação inteira: a preferência mora no `localStorage`,
   e o `.bat` abre um **perfil separado** (`--user-data-dir`). Marcada numa
   janela normal do Chrome, ela **não existe** no perfil da cabine — a janela
   abre com a opção desligada e nunca procura pedido nenhum. Marque dentro da
   janela do `.bat` e **recarregue**. Confirmação visual: com a escuta ativa
   aparece **🖨 cabine** no topo da tela.

   Repare que **imprimir clicando no botão funciona mesmo com a opção
   desligada** — ela só liga a escuta em segundo plano. É por isso que dá pra
   ter "a cabine imprime, o celular não" com tudo parecendo certo.
3. **Foi aberto pelo `.bat`?** Este é o motivo mais traiçoeiro. O pedido do
   celular chega numa verificação em segundo plano, **sem clique**, e sem
   `--disable-popup-blocking` o navegador barra a janela de impressão em
   silêncio. Abrir o app "na mão" numa aba normal imprime bem quando *você*
   clica em Imprimir, mas nunca imprime o que vem do celular — exatamente o
   sintoma de "a cabine imprime, o celular não".
4. **Mesma filial nos dois lados?** O pedido é gravado na filial de quem
   mandou; a cabine só enxerga os da filial dela.

Estar na **mesma rede não é requisito** e não ajuda no diagnóstico: o celular
não fala com a cabine pela rede local — grava o pedido no Supabase e a cabine
busca de lá. Funciona igual com o celular no 4G.

Pra saber onde parou, olhe a tabela no SQL Editor:

```sql
select criado_em, status, erro from print_jobs order by criado_em desc limit 10;
```

| O que aparece | Onde está o problema |
|---|---|
| Nenhuma linha | O celular não chegou a gravar o pedido (botão não usado, ou erro no envio) |
| `pendente` acumulando | A cabine não está escutando — caso 1, 2 ou 4 acima |
| `erro` | A cabine pegou o pedido mas não imprimiu; a coluna `erro` diz o motivo (caso 3) |
| `impresso` mas sem papel | Problema no driver/impressora, não no app |

Desde a correção do pedido silencioso, o caso 3 deixa rastro: o pedido fica
com status `erro` na tabela `print_jobs`, com a explicação — antes ele era
marcado como impresso e o papel simplesmente não saía.

**Windows 7** não é impedimento pro pedido do celular em si, mas prenda o
detalhe: Chrome e Edge pararam de atualizar no Windows 7 na versão 109
(início de 2023). O app roda nessa versão, só não há mais correção de
segurança do navegador — vale planejar a troca da máquina.

## Como o app imprime

`imprimirTicket` ([src/componentes/Ticket.jsx](../src/componentes/Ticket.jsx))
abre uma janela pequena com o HTML do comprovante, chama `print()` e fecha
sozinha no `onafterprint`. Com kiosk-printing, o operador vê só um piscar de
tela e o papel saindo.

## Imprimir puxando do celular

Celular não tem `--kiosk-printing` (é flag de linha de comando do Chrome
desktop) — todo navegador mobile sempre abre o diálogo de impressão do
sistema. Em vez de uma ponte nova, esta mesma janela da cabine também serve
de "escuta": em **Configurações → Aparência**, marque **"Este navegador
imprime os pedidos vindos do celular"** (só nesta máquina — é preferência de
navegador, como o tema). A partir daí, o app checa a cada ~4s se algum
celular pediu impressão (tabela `print_jobs`, ver
[Layout.jsx](../src/componentes/Layout.jsx)) e chama o mesmo `imprimirTicket`
de sempre — nenhum processo novo rodando na máquina.

No celular, o botão **"Imprimir na cabine"** do comprovante manda o pedido
(fire-and-forget: não há confirmação ao vivo de que o papel saiu — se a
janela da cabine não estiver aberta com a flag ligada, o pedido fica
pendente até alguém notar).

Tem também **"Imprimir Bluetooth"**, pra uma impressora térmica portátil
pareada direto no celular (Android/Chrome só — Web Bluetooth não existe no
iPhone). Ver [src/lib/escpos.js](../src/lib/escpos.js) e
[src/lib/bluetoothPrinter.js](../src/lib/bluetoothPrinter.js).
