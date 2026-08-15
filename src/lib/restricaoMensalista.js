// Restrição de dia/turno contratado pelo mensalista — réplica de
// ESTALANC.PRG:520-563 (RESTRM/RESTRT/RESTRN + PERIODO1/2/3), com um
// refinamento combinado com o Eduardo: quando a entrada cai fora do horário
// contratado, a saída cobra avulso só até o início do próximo turno
// contratado no mesmo dia — não a estadia inteira.
//
// Cada um de restrM/T/N é uma string de 7 posições, domingo→sábado, S/N
// (contratado ou não naquele dia). Campo ausente/vazio = SEM restrição
// (todo dia liberado) — é o que preserva o comportamento de hoje pra quem
// nunca configurou isso (todo mensalista existente tem esses campos nulos).

/** Dia da semana no padrão do legado: 1=domingo…7=sábado (Date#getDay() é 0=domingo). */
export function diaSemanaLegado(date) {
  return date.getDay() + 1;
}

/**
 * Limites (HH.MM) de início de cada turno. periodo1/2/3 todos ausentes/zero
 * cai no padrão do legado: manhã 6h, tarde 12h, noite 18h.
 */
function limitesTurno(periodo1, periodo2, periodo3) {
  const semConfig = !(Number(periodo1) || Number(periodo2) || Number(periodo3));
  return {
    M: semConfig ? 6.0 : Number(periodo1),
    T: semConfig ? 12.0 : Number(periodo2),
    N: semConfig ? 18.0 : Number(periodo3),
  };
}

/** Turno (M/T/N) de um horário HH.MM, dados os limites do mensalista. */
export function turnoDoHorario(hora, periodo1, periodo2, periodo3) {
  const { M, T, N } = limitesTurno(periodo1, periodo2, periodo3);
  if (hora >= M && hora < T) return 'M';
  if (hora >= T && hora < N) return 'T';
  return 'N';
}

/**
 * O turno está contratado nesse dia da semana? Campo vazio/ausente = SEM
 * restrição (contratado todo dia) — só um valor S/N explícito na posição do
 * dia bloqueia.
 */
export function turnoContratado(turno, diaSemana, restrM, restrT, restrN) {
  const campo = turno === 'M' ? restrM : turno === 'T' ? restrT : restrN;
  if (!campo) return true;
  return String(campo).toUpperCase()[diaSemana - 1] === 'S';
}

/**
 * Verifica a entrada contra o horário contratado do mensalista.
 *
 * `dentroDoHorario: true` — turno atual contratado, segue como mensalista,
 * sem mais nada a fazer.
 *
 * `dentroDoHorario: false` — fora do contratado: `livreAPartir` é o horário
 * (mesmo dia) em que o PRÓXIMO turno contratado começa — cobra avulso só até
 * lá. `null` quando nenhum turno restante do dia está contratado — cobra
 * avulso a estadia inteira (mesmo resultado de hoje, sem alívio).
 */
export function calcularRestricaoEntrada({ horaEntrada, diaSemana, mensalista }) {
  const { restr_manha, restr_tarde, restr_noite, periodo1, periodo2, periodo3 } = mensalista;
  const turnoAtual = turnoDoHorario(horaEntrada, periodo1, periodo2, periodo3);
  if (turnoContratado(turnoAtual, diaSemana, restr_manha, restr_tarde, restr_noite)) {
    return { dentroDoHorario: true, livreAPartir: null };
  }

  // Próximo turno contratado, por horário de início — não por uma ordem fixa
  // M→T→N: a "noite" cobre tanto o fim quanto o começo do dia (antes do
  // período 1), então uma entrada de madrugada (turno N, mas ainda antes do
  // período 1) ainda tem manhã E tarde do MESMO dia pela frente.
  const limites = limitesTurno(periodo1, periodo2, periodo3);
  const restantes = ['M', 'T', 'N']
    .filter((t) => t !== turnoAtual && limites[t] > horaEntrada)
    .sort((a, b) => limites[a] - limites[b]);
  for (const t of restantes) {
    if (turnoContratado(t, diaSemana, restr_manha, restr_tarde, restr_noite)) {
      return { dentroDoHorario: false, livreAPartir: limites[t] };
    }
  }
  return { dentroDoHorario: false, livreAPartir: null };
}
