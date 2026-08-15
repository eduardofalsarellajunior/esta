// Preferências pessoais do navegador (não da filial) — mesmo espírito de
// tema.js: cada aparelho guarda a sua, sem afetar os outros.
const CHAVE_IMPRIME_CABINE = 'esta-imprime-pedidos-cabine';

/** Este navegador é o que roda na cabine e deve imprimir os pedidos remotos? */
export function imprimePedidosDaCabine() {
  return localStorage.getItem(CHAVE_IMPRIME_CABINE) === 'true';
}

export function definirImprimePedidosDaCabine(ligado) {
  localStorage.setItem(CHAVE_IMPRIME_CABINE, ligado ? 'true' : 'false');
}
