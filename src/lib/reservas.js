// Capacidade de vagas por tipo (ex.: coberta/descoberta) e dia, a partir de
// `vagas` (total cadastrado, ver Cadastros → Vagas/boxes) e `reservas`
// (ver supabase/migrations/0035_reservas.sql). Mensalistas e avulsos não
// entram nessa conta — só reservas confirmadas.
//
// `supabase` vem por parâmetro (não importado direto) pro arquivo poder ser
// testado com `node --test` puro (sem Vite, sem import.meta.env) — mesmo
// padrão de src/lib/fiscal.js/notaFiscal.js.
import { somarDias, dataDeISO } from './tempo.js';
import { calcularProporcional } from '../../packages/tarifacao/tarifacao.ts';

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

/**
 * Prefixo (letras iniciais) do código da vaga — ex.: "C001" -> "C". Mesmo
 * texto que o "Prefixo do código" do cadastro em lote (ver cadastros.jsx)
 * pede pra digitar; aqui ele também vira o código da tabela de preço usada
 * pra propor um valor de reserva (ver `mapaTabelaPorTipo`/`valorPropostoReserva`).
 */
export function prefixoTabela(codigo) {
  return String(codigo || '').match(/^[^\d]+/)?.[0]?.trim().toUpperCase() || '';
}

/**
 * Tabela de preço predominante de cada tipo de vaga, a partir do prefixo do
 * código (ex.: vagas "C001".."C040" tipo "Coberta" -> tabela "C"). Quando um
 * tipo tem prefixos divergentes entre as vagas (cadastro inconsistente), vence
 * o mais frequente. Tipo sem nenhum prefixo reconhecível fica de fora do mapa
 * (sem valor proposto pra ele — não quebra nada, só não estima).
 */
export function mapaTabelaPorTipo(vagas) {
  const contagem = {};
  for (const v of vagas || []) {
    const prefixo = prefixoTabela(v.codigo);
    if (!prefixo || !v.tipo) continue;
    contagem[v.tipo] ??= {};
    contagem[v.tipo][prefixo] = (contagem[v.tipo][prefixo] || 0) + 1;
  }
  const mapa = {};
  for (const [tipo, porPrefixo] of Object.entries(contagem)) {
    mapa[tipo] = Object.entries(porPrefixo).sort(([, a], [, b]) => b - a)[0][0];
  }
  return mapa;
}

/** Busca `vagas` e devolve o mapa tipo -> tabela de preço (ver `mapaTabelaPorTipo`). */
export async function tabelaPorTipoDeVaga(supabase) {
  const { data } = await supabase.from('vagas').select('tipo, codigo').eq('ativo', true);
  return mapaTabelaPorTipo(data || []);
}

/**
 * Valor proposto pra uma reserva de `dataInicio` a `dataFim` (dias corridos,
 * ambos inclusive) na tabela de preço `tabelaCodigo` — usa o MESMO motor de
 * tarifação da cobrança real (ver packages/tarifacao), simulando uma entrada
 * às 00:00 de `dataInicio` e saída às 00:00 do dia seguinte a `dataFim` (pra
 * contar o último dia inteiro). É só uma estimativa impressa no ticket —
 * quem cobra de verdade é a saída real do veículo (ver Patio.jsx), que pode
 * dar um valor diferente (hora exata de chegada, convênio, serviços...).
 * `null` quando não há tabela pro código (tipo sem prefixo reconhecível ou
 * sem tabela de preço vigente com esse código).
 */
export function valorPropostoReserva(tabelas, tabelaCodigo, dataInicio, dataFim) {
  const tbl = tabelas?.[tabelaCodigo];
  if (!tbl) return null;
  const movimento = {
    dtEntrada: dataDeISO(dataInicio), entrada: 0,
    dtSaida: dataDeISO(somarDias(dataFim, 1)), saida: 0,
  };
  const r = calcularProporcional(tbl, movimento);
  return { valor: r.valor ?? 0, pedeValor: !!r.pedeValor, manual: r.valor == null };
}
