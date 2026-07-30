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

/** Combina data ISO + hora comercial HH.MM num Date real (tempo de parede, não "hora comercial"). */
export function dataHoraDe(dtISO, hhmm) {
  const d = dataDeISO(dtISO);
  const h = Math.trunc(hhmm);
  const m = Math.round((hhmm - h) * 100);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Formata data ISO 'YYYY-MM-DD' como 'DD/MM/AAAA'. */
export function fmtDataBR(iso) {
  return iso ? String(iso).split('-').reverse().join('/') : '—';
}

/**
 * Mesmo dia do mês seguinte, em ISO. Se o dia não existir no mês de destino
 * (ex.: 31/01 -> fevereiro), cai no último dia daquele mês.
 */
export function somarUmMes(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const ultimoDiaDestino = new Date(y, m + 1, 0).getDate(); // m+1 = mês seguinte (1-based -> 0-based +1)
  const alvo = new Date(y, m, Math.min(d, ultimoDiaDestino));
  const mm = String(alvo.getMonth() + 1).padStart(2, '0');
  const dd = String(alvo.getDate()).padStart(2, '0');
  return `${alvo.getFullYear()}-${mm}-${dd}`;
}

/** Limites [início, fim) em ISO/UTC de um intervalo de dias locais 'YYYY-MM-DD' — pra comparar com timestamptz (ex.: movimentos.excluido_em). */
export function limitesDiaLocal(deISO, ateISO) {
  const inicio = dataDeISO(deISO);
  const fim = dataDeISO(ateISO);
  fim.setDate(fim.getDate() + 1);
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
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
