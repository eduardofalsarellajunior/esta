// Memória de recolhimento de ISS (A/R) por placa, em `clientes` (a mesma
// tabela que já guarda telefone/pontos de fidelidade por placa entre
// visitas — ver Patio.jsx `celularSalvo`/`atualizarFidelidade`).
//
// A obrigação de reter é do tomador e normalmente só se descobre quando a
// prefeitura rejeita um RPS — por isso essa memória existe: uma vez
// corrigido pra uma placa (Pátio ou Fiscal → Alterar), as próximas notas
// dessa mesma placa já vêm certas sozinhas.

/** 'A'/'R' (convenção do cadastro) -> código que gerarXmlAbrasfLoteRps espera. */
export const AR_PARA_ABRASF = { A: '2', R: '1' };
/** Código Abrasf -> 'A'/'R', pra gravar de volta na memória por placa. */
export const ABRASF_PARA_AR = { '2': 'A', '1': 'R' };

export async function issRetidoDaPlaca(supabase, placa) {
  if (!placa) return null;
  try {
    const { data } = await supabase.from('clientes').select('iss_retido')
      .eq('placa', String(placa).trim().toUpperCase()).maybeSingle();
    return data?.iss_retido || null;
  } catch {
    return null;
  }
}

/** Best-effort — nunca deve travar emissão de nota nem saída do pátio. */
export async function salvarIssRetidoDaPlaca(supabase, filialId, placa, issRetido) {
  if (!placa || !issRetido) return;
  try {
    const p = String(placa).trim().toUpperCase();
    const { data: c } = await supabase.from('clientes').select('id').eq('placa', p).maybeSingle();
    if (c) await supabase.from('clientes').update({ iss_retido: issRetido }).eq('id', c.id);
    else await supabase.from('clientes').insert({ filial_id: filialId, placa: p, iss_retido: issRetido });
  } catch { /* melhor esforço */ }
}
