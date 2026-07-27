// Preferência de tema (claro/escuro) — pessoal do navegador, não da filial.
const CHAVE = 'esta-tema';

export function obterTema() {
  return localStorage.getItem(CHAVE) || 'escuro';
}

export function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  localStorage.setItem(CHAVE, tema);
}
