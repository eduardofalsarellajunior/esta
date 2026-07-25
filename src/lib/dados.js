// Carrega dados do Supabase e mapeia para os tipos do motor de tarifação.
import { supabase } from './supabase.js';

/**
 * Carrega as tabelas de preço vigentes + faixas e devolve no formato que o
 * motor de tarifação espera: Record<tipo, TabelaPreco>.
 */
export async function carregarTabelasPreco() {
  const { data: tabelas, error: e1 } = await supabase
    .from('tabelas_preco')
    .select('*')
    .is('vigencia_fim', null)
    .eq('ativo', true);
  if (e1) throw e1;

  const { data: faixas, error: e2 } = await supabase
    .from('tabela_preco_faixas')
    .select('*');
  if (e2) throw e2;

  const mapa = {};
  for (const t of tabelas) {
    mapa[t.tipo] = {
      tipo: t.tipo,
      porMinuto: t.por_minuto,
      ePernoite: Number(t.pernoite_ini),
      sPernoite: Number(t.pernoite_fim),
      vPernoite: Number(t.valor_diaria),
      tol: Number(t.tolerancia_pct),
      qtePontos: Number(t.qte_pontos),
      faixas: faixas
        .filter((f) => f.tabela_preco_id === t.id)
        .sort((a, b) => a.ordem - b.ordem)
        .map((f) => ({
          ate: Number(f.ate),
          hor: Number(f.valor_hora),
          con: Number(f.valor_convenio),
        })),
    };
  }
  return mapa;
}

/** Movimentos abertos (veículos no pátio). RLS já filtra pela filial. */
export async function carregarPatio() {
  const { data, error } = await supabase
    .from('movimentos')
    .select('*')
    .is('dt_saida', null)
    .order('dt_entrada', { ascending: true })
    .order('hr_entrada', { ascending: true });
  if (error) throw error;
  return data;
}
