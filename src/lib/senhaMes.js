// Porta fiel de `PROCEDURE calculosenha` do legado Clipper (C:\bkesta\calculasenha.txt).
// A "senha do mês" é a que o Eduardo (fornecedor) manda pro dono de cada
// filial antes do fim de cada mês, pra confirmar que a mensalidade dele
// (com o Eduardo, não com o estacionamento) está em dia — se ninguém souber
// a senha do mês corrente na primeira entrada do sistema, é sinal de que
// não pagou. Depende só do mês/ano corrente (troca uma vez por mês, não por
// dia) e do "Núm. Cliente" cadastrado em Configurações → Dados do
// estacionamento.
//
// IMPORTANTE: este arquivo só pode ser importado por código de servidor
// (api/*.js) — nunca por uma tela (src/telas/*.jsx). Se entrar no bundle do
// navegador, qualquer operador com DevTools calcula a senha sozinho (o
// "Núm. Cliente" já aparece na tela), o que anula o mecanismo. Ver
// api/conferir-senha-mes.js e api/cadastrar-senha-mes.js.
//
// Fidelidade ao Clipper, ponto a ponto:
// - `CTOD("01/01/1800") - primeiroDiaDoMes` é diferença de dias em calendário
//   puro, sem fuso/horário de verão — por isso `diasEntre` usa Date.UTC dos
//   componentes de calendário (ano/mês/dia locais), não subtração direta de
//   objetos Date locais, que erraria em anos com mudança de horário de
//   verão entre 1800 e hoje.
// - `STR(n, largura)`: formata em largura fixa, right-justified, preenchendo
//   com espaço à esquerda (o sinal "-" ocupa uma posição); `VAL()` de um
//   único caractere não-dígito (espaço, "-") vale 0 — é assim que os 7
//   dígitos "nr1..nr7" nascem de uma string que quase sempre começa com
//   espaço+sinal de menos, porque a diferença é sempre negativa.
// - O "dígito verificador" repetido (primdig..sextodig) é módulo 11 clássico
//   (mesma família de DV de CPF/CNPJ/boleto): soma ponderada → resto mod 11
//   → 11-resto → se >=10 vira 0.
// - A senha final embaralha os 10 dígitos em 5 pares simétricos (1,10)(2,9)
//   (3,8)(4,7)(5,6), cada par vira uma letra A-Z, e a ordem final das 5
//   letras é embaralhada (índices 3,2,4,1,5 — não é 1,2,3,4,5).
//
// Conferido contra um caso real do Eduardo: cliente 703, mês 08/2026 →
// "CZMCR" (bate exato com o que este código calcula).

/** Diferença em dias entre duas datas, em calendário puro (sem DST). diasEntre(a,b) = b - a. */
function diasEntre(a, b) {
  const dia = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((dia(b) - dia(a)) / 86_400_000);
}

function strClipper(n, largura) {
  const s = String(Math.trunc(n));
  if (s.length > largura) return '*'.repeat(largura);
  return s.padStart(largura, ' ');
}

function valChar(c) {
  return /[0-9]/.test(c) ? Number(c) : 0;
}

/** Dígito verificador módulo 11: soma ponderada → resto → 11-resto → >=10 vira 0. */
function dv11(soma) {
  const resto = soma % 11;
  const d = 11 - resto;
  return d >= 10 ? 0 : d;
}

/** VAL() do Clipper aplicado ao "Núm. Cliente": dígitos do início, resto ignorado, inválido = 0. */
export function numeroClienteComoValor(numeroCliente) {
  const n = parseInt(String(numeroCliente ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Calcula a senha do mês corrente (não depende do dia, só do mês/ano de
 * `hoje`) pro número de cliente informado. `numeroCliente` é o texto salvo
 * em `filiais.numero_cliente`.
 */
export function calcularSenhaMes(numeroCliente, hoje = new Date()) {
  const wnumcli = numeroClienteComoValor(numeroCliente);

  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const base1800 = new Date(1800, 0, 1);
  // diasEntre(a, b) = b - a; queremos base1800 - primeiroDiaMes.
  const diffDiasBase = diasEntre(primeiroDiaMes, base1800);

  const cAux = strClipper(diffDiasBase, 7);
  const nr = [1, 2, 3, 4, 5, 6, 7].map((i) => valChar(cAux[i - 1]));
  const [nr1, nr2, nr3, nr4, nr5, nr6, nr7] = nr;

  const primdig = dv11(nr7 * 2 + nr6 * 3 + nr5 * 4 + nr4 * 5 + nr3 * 6 + nr2 * 7 + nr1 * 8);
  const segdig = dv11(
    primdig * 2 + nr7 * 3 + nr6 * 4 + nr5 * 5 + nr4 * 6 + nr3 * 7 + nr2 * 8 + nr1 * 9
  );
  const tercdig = dv11(
    primdig * 2 + segdig * 3 + nr7 * 4 + nr6 * 5 + nr5 * 6 + nr4 * 7 + nr3 * 8 + nr2 * 9 + nr1 * 10
  );
  const quartodig = dv11(
    primdig * 2 + segdig * 3 + tercdig * 4 + nr7 * 5 + nr6 * 6 + nr5 * 7 + nr4 * 8 + nr3 * 9 + nr2 * 10 + nr1 * 11
  );
  const quintodig = dv11(
    primdig * 2 + segdig * 3 + tercdig * 4 + quartodig * 5 +
    nr7 * 6 + nr6 * 7 + nr5 * 8 + nr4 * 9 + nr3 * 10 + nr2 * 11 + nr1 * 12
  );
  const sextodig = dv11(
    primdig * 2 + segdig * 3 + tercdig * 4 + quartodig * 5 + quintodig * 6 +
    nr7 * 7 + nr6 * 8 + nr5 * 9 + nr4 * 10 + nr3 * 11 + nr2 * 12 + nr1 * 13
  );

  // Nota: o Clipper original calcula aqui um `senhalibera` intermediário
  // (SUBSTR(STR(3digitos+wnumcli,5),3,3)) que nunca é lido depois — é
  // descartado antes do próximo uso da variável. Fidelidade ao resultado
  // final não exige reproduzir esse passo morto.

  const seisDigitos = Number(`${primdig}${segdig}${tercdig}${quartodig}${quintodig}${sextodig}`);
  const combinado = wnumcli * 1_000_000 + seisDigitos;
  const dez = String(Math.trunc(combinado)).padStart(10, '0');

  const par = (a, b) => Number(dez[a - 1] + dez[b - 1]);
  const [sn1, sn2, sn3, sn4, sn5] = [par(1, 10), par(2, 9), par(3, 8), par(4, 7), par(5, 6)]
    .map((v) => (v > 90 ? v - 65 : v))
    .map((v) => (v % 26) + 65);

  return String.fromCharCode(sn3, sn2, sn4, sn1, sn5);
}
