// Utilidades de texto reaproveitadas entre telas (Pátio, Mensalistas).

/** Maiúsculas e sem acento, pra comparação tolerante (busca de modelo). */
export function normalizar(s) {
  return (s || '').toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// Placa antiga (ABC1234) ou Mercosul (ABC1D23): 3 letras + 1 número + (3 números OU 1 letra + 2 números).
export const REGEX_PLACA = /^[A-Z]{3}\d(\d{3}|[A-Z]\d{2})$/;
