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

Rodar sem argumento abre a produção; passando uma URL (`pdv-cabine.bat
http://localhost:5174`) dá pra testar o mesmo comportamento no dev.

## Por que não dá pra ligar/desligar pelo app

`--kiosk-printing` é lida **na subida do processo do Chrome** e vale enquanto
aquele perfil estiver aberto. Nenhum código da página — nem `window.print()`,
nem service worker, nem a PWA instalada — liga ou desliga isso.

Daí o perfil separado: sem ele, a flag no atalho normal do Chrome faria
*qualquer* site imprimir em silêncio. Com ele, fechou a janela do PDV, acabou.

## Checklist da máquina

1. A impressora do ticket precisa estar como **padrão do Windows** — no modo
   kiosk não há escolha de impressora.
2. Faça o login do operador uma vez na janela do PDV; o perfil guarda a sessão.
3. Se o ticket sair com margens/cabeçalho do navegador, ajuste em
   *Configurações de impressão* daquele perfil (o kiosk usa as últimas
   preferências salvas dali).
4. Colocar o `.bat` na pasta de inicialização (`shell:startup`) deixa o PDV
   subindo sozinho quando a máquina liga.

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
