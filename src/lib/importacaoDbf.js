// Grava no Supabase o que foi lido/mapeado do .dbf (packages/dbf). Só cria o
// que for novo — código (ou placa) já existente é sempre ignorado, nunca
// atualizado, pra não sobrescrever edição feita no app depois da última
// importação.
import { supabase } from './supabase.js';

const TAMANHO_LOTE = 200;

function emLotes(array, tamanho) {
  const lotes = [];
  for (let i = 0; i < array.length; i += tamanho) lotes.push(array.slice(i, i + tamanho));
  return lotes;
}

/**
 * `linhas`: já convertidas pelas colunas de destino (ver packages/dbf/mapeamento.ts
 * `converterLinha`), uma por registro do .dbf. `placasPorLinha` (só mensalistas):
 * array paralelo a `linhas`, cada item uma lista de placas (strings) daquele
 * mensalista, já extraídas dos campos placa1/placa2/placa3 mapeados.
 */
export async function importarDestino({ perfil, destino, colunas, linhas, placasPorLinha }) {
  const resultado = { criados: 0, ignorados: 0, erros: [] };

  // Linhas sem os campos obrigatórios (ex.: código ou nome vazios) nem tentam ir pro banco.
  const obrigatorias = colunas.filter((c) => c.obrigatorio).map((c) => c.campo);
  const validas = [];
  linhas.forEach((linha, i) => {
    const faltando = obrigatorias.filter((campo) => linha[campo] == null || linha[campo] === '');
    if (faltando.length) {
      resultado.erros.push({ linha: i + 1, motivo: `Sem ${faltando.join(', ')} — linha ignorada.` });
      return;
    }
    validas.push({ linha, placas: placasPorLinha?.[i] || [] });
  });

  const { data: existentesData, error: errExistentes } = await supabase
    .from(destino.tabela).select('codigo').eq('filial_id', perfil.filial_id);
  if (errExistentes) { resultado.erros.push({ linha: 0, motivo: `Erro ao consultar cadastros existentes: ${errExistentes.message}` }); return resultado; }
  const codigosExistentes = new Set((existentesData || []).map((r) => r.codigo));

  const novas = [];
  for (const { linha, placas } of validas) {
    if (codigosExistentes.has(linha.codigo)) { resultado.ignorados++; continue; }
    novas.push({ linha, placas });
    codigosExistentes.add(linha.codigo); // protege contra códigos duplicados dentro do próprio arquivo
  }

  for (const lote of emLotes(novas, TAMANHO_LOTE)) {
    const payload = lote.map(({ linha }) => ({ ...linha, filial_id: perfil.filial_id }));
    const { data: inseridos, error } = await supabase.from(destino.tabela).insert(payload).select('id, codigo');
    if (error) {
      lote.forEach(({ linha }) => resultado.erros.push({ linha: linha.codigo, motivo: error.message }));
      continue;
    }
    resultado.criados += inseridos.length;

    if (destino.tabela === 'mensalistas') {
      await importarPlacas({ perfil, lote, inseridos, resultado });
    }
  }

  return resultado;
}

async function importarPlacas({ perfil, lote, inseridos, resultado }) {
  const idPorCodigo = new Map(inseridos.map((r) => [r.codigo, r.id]));
  const candidatas = [];
  for (const { linha, placas } of lote) {
    const mensalistaId = idPorCodigo.get(linha.codigo);
    if (!mensalistaId) continue;
    for (const placa of placas) {
      const p = String(placa || '').trim().toUpperCase();
      if (p) candidatas.push({ mensalista_id: mensalistaId, placa: p });
    }
  }
  if (!candidatas.length) return;

  const { data: jaExistem } = await supabase.from('mensalista_veiculos').select('placa').eq('filial_id', perfil.filial_id);
  const placasExistentes = new Set((jaExistem || []).map((r) => r.placa));

  const novas = candidatas.filter((c) => {
    if (placasExistentes.has(c.placa)) { resultado.erros.push({ linha: c.placa, motivo: 'Placa já cadastrada (nesta ou noutra filial) — não importada.' }); return false; }
    placasExistentes.add(c.placa);
    return true;
  });
  if (!novas.length) return;

  const payload = novas.map((c) => ({ filial_id: perfil.filial_id, mensalista_id: c.mensalista_id, placa: c.placa }));
  const { error } = await supabase.from('mensalista_veiculos').insert(payload);
  if (error) resultado.erros.push({ linha: 0, motivo: `Placas: ${error.message}` });
}
