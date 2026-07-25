// Helpers de "hora comercial" HH.MM (14.30 = 14h30) usada pelo motor e pelo banco.

/** Hora atual como HH.MM (ex.: 14h30 -> 14.30). */
export function agoraHHMM() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 100;
}

/** Data de hoje em ISO 'YYYY-MM-DD' (local). */
export function hojeISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Converte 'YYYY-MM-DD' em Date local (evita deslocamento de fuso do new Date(str)). */
export function dataDeISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Formata HH.MM como 'HH:MM' para exibição. */
export function fmtHora(v) {
  const h = Math.trunc(v);
  const m = Math.round((v - h) * 100);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Formata valor em reais. */
export function fmtBRL(v) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
