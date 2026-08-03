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

/** Soma (ou subtrai, se negativo) dias a uma data ISO 'YYYY-MM-DD'. */
export function somarDias(iso, dias) {
  const d = dataDeISO(iso);
  d.setDate(d.getDate() + Number(dias || 0));
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Próximo vencimento com dia fixo: mês seguinte ao de `iso`, no dia `diaVenc`
 * (ex.: pago em 15/07 com dia de vencimento 10 -> próximo vence 10/08, não
 * 15/08). Se o dia não existir no mês de destino, cai no último dia daquele
 * mês. Sem `diaVenc` cadastrado, mantém o comportamento antigo (mesmo dia).
 */
export function proximoVencimento(iso, diaVenc) {
  const dia = Number(diaVenc);
  if (!dia) return somarUmMes(iso);
  const [y, m] = String(iso).split('-').map(Number);
  const ultimoDiaDestino = new Date(y, m + 1, 0).getDate(); // mês seguinte a `m` (1-based m == index 0-based do mês seguinte)
  const alvo = new Date(y, m, Math.min(dia, ultimoDiaDestino));
  const mm = String(alvo.getMonth() + 1).padStart(2, '0');
  const dd = String(alvo.getDate()).padStart(2, '0');
  return `${alvo.getFullYear()}-${mm}-${dd}`;
}

/**
 * Primeiro vencimento a partir de uma data de início (primeira mensalidade de
 * um mensalista novo): a próxima ocorrência do dia `diaVenc` — no mesmo mês,
 * se esse dia ainda não passou, ou no mês seguinte, se já passou. Ex.: início
 * em 15/07 com dia de vencimento 10 -> primeiro vencimento 10/08 (o dia 10 de
 * julho já tinha passado). Sem `diaVenc` cadastrado, cai no "mesmo dia do mês
 * seguinte" (mesmo comportamento de `proximoVencimento`).
 */
export function primeiroVencimento(iso, diaVenc) {
  const dia = Number(diaVenc);
  if (!dia) return somarUmMes(iso);
  const [y, m, d] = String(iso).split('-').map(Number);
  const mesAlvo = d <= dia ? m - 1 : m; // 0-based: mesmo mês, ou o seguinte se o dia já passou
  const ultimoDiaAlvo = new Date(y, mesAlvo + 1, 0).getDate();
  const alvo = new Date(y, mesAlvo, Math.min(dia, ultimoDiaAlvo));
  const mm = String(alvo.getMonth() + 1).padStart(2, '0');
  const dd = String(alvo.getDate()).padStart(2, '0');
  return `${alvo.getFullYear()}-${mm}-${dd}`;
}

/** Diferença em dias entre duas datas ISO (ate - de). */
export function diferencaEmDias(deISO, ateISO) {
  return Math.round((dataDeISO(ateISO).getTime() - dataDeISO(deISO).getTime()) / 86400000);
}

/**
 * O mensalista está dentro do vencimento (+ tolerância)? Sem data de próximo
 * pagamento cadastrada, considera dentro (mensalista ainda sem controle de
 * vencimento — não bloqueia quem já existia antes desse controle).
 */
export function dentroDoVencimento(proximoPagamentoISO, toleranciaDias) {
  if (!proximoPagamentoISO) return true;
  return hojeISO() <= somarDias(proximoPagamentoISO, toleranciaDias || 0);
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
