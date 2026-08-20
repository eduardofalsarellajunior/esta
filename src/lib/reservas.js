// Capacidade de vagas por tipo (ex.: coberta/descoberta) e dia, a partir de
// `vagas` (total cadastrado, ver Cadastros → Vagas/boxes) e `reservas`
// (ver supabase/migrations/0035_reservas.sql). Mensalistas e avulsos não
// entram nessa conta — só reservas confirmadas.
//
// `supabase` vem por parâmetro (não importado direto) pro arquivo poder ser
// testado com `node --test` puro (sem Vite, sem import.meta.env) — mesmo
// padrão de src/lib/fiscal.js/notaFiscal.js.
import { somarDias } from './tempo.js';

/**
 * Todo tipo distinto cadastrado em `vagas` (ativas) — usado pra popular o
 * <select> do formulário de reserva sem fixar "coberta/descoberta": cada
 * filial usa o texto que quiser em vagas.tipo.
 */
export async function tiposDeVaga(supabase) {
  const { data } = await supabase.from('vagas').select('tipo').eq('ativo', true).not('tipo', 'is', null);
  return [...new Set((data || []).map((v) => v.tipo).filter(Boolean))].sort();
}

/**
 * Mapa `{ [dataISO]: { [tipo]: restante } }` pro intervalo [dataInicio,
 * dataFim]. Uma reserva por período (manhã/tarde/noite) também é contada
 * como ocupando o dia inteiro — conservador de propósito, pra nunca
 * prometer uma vaga que colide na prática (ver comentário na migration).
 */
export async function capacidadePorDia(supabase, dataInicio, dataFim) {
  const [{ data: vagas }, { data: reservas }] = await Promise.all([
    supabase.from('vagas').select('tipo').eq('ativo', true).not('tipo', 'is', null),
    supabase.from('reservas').select('tipo, data_inicio, data_fim')
      .eq('status', 'confirmada').lte('data_inicio', dataFim).gte('data_fim', dataInicio),
  ]);

  const totalPorTipo = {};
  for (const v of vagas || []) totalPorTipo[v.tipo] = (totalPorTipo[v.tipo] || 0) + 1;

  const mapa = {};
  for (let dia = dataInicio; dia <= dataFim; dia = somarDias(dia, 1)) {
    mapa[dia] = { ...totalPorTipo };
  }
  for (const r of reservas || []) {
    if (!(r.tipo in totalPorTipo)) continue; // tipo sem vaga cadastrada (não deveria acontecer, mas não quebra)
    const inicio = r.data_inicio > dataInicio ? r.data_inicio : dataInicio;
    const fim = r.data_fim < dataFim ? r.data_fim : dataFim;
    for (let dia = inicio; dia <= fim; dia = somarDias(dia, 1)) {
      if (mapa[dia]) mapa[dia][r.tipo] = (mapa[dia][r.tipo] ?? totalPorTipo[r.tipo]) - 1;
    }
  }
  return mapa;
}

/** Dias do intervalo pedido em que não sobra vaga do tipo escolhido (vazio = tudo livre). */
export function diasSemVaga(mapaCapacidade, tipo, dataInicio, dataFim) {
  const dias = [];
  for (let dia = dataInicio; dia <= dataFim; dia = somarDias(dia, 1)) {
    const restante = mapaCapacidade[dia]?.[tipo];
    if (restante == null || restante <= 0) dias.push(dia);
  }
  return dias;
}
