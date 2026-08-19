// Grava no Supabase o que foi lido/mapeado do .dbf (packages/dbf). Só cria o
// que for novo — código (ou placa) já existente é sempre ignorado, nunca
// atualizado, pra não sobrescrever edição feita no app depois da última
// importação.
import { supabase } from './supabase.js';
import { normalizar } from './texto.js';

const TAMANHO_LOTE = 200;

function emLotes(array, tamanho) {
  const lotes = [];
  for (let i = 0; i < array.length; i += tamanho) lotes.push(array.slice(i, i + tamanho));
  return lotes;
}

/**
 * Tabela (tipo_veic) por nome de modelo — mesma lógica que a tela de
 * Mensalistas usa ao selecionar um "Carro" conhecido (auto-preenche a
 * tabela dele). Sem isso, todo veículo importado do .dbf ficava sem
 * tipo_veic, e a entrada de mensalista parava pedindo pra completar à mão
 * em vez de dar entrada sozinha.
 */
async function catalogoTabelaPorModelo(filialId) {
  const { data } = await supabase.from('modelos_veiculo').select('nome, tabela_tipo').eq('filial_id', filialId);
  return new Map((data || []).filter((m) => m.tabela_tipo).map((m) => [normalizar(m.nome), m.tabela_tipo]));
}

/** Linhas sem os campos obrigatórios nem tentam ir pro banco. */
function separarValidas(colunas, linhas) {
  const obrigatorias = colunas.filter((c) => c.obrigatorio).map((c) => c.campo);
  const validas = [];
  const erros = [];
  linhas.forEach((linha, i) => {
    const faltando = obrigatorias.filter((campo) => linha[campo] == null || linha[campo] === '');
    if (faltando.length) erros.push({ linha: i + 1, motivo: `Sem ${faltando.join(', ')} — linha ignorada.` });
    else validas.push(linha);
  });
  return { validas, erros };
}

/**
 * Importação "de cadastro": cria registro novo em `destino.tabela` por linha,
 * ignorando código já existente. `linhas`: já convertidas pelas colunas de
 * destino (ver packages/dbf/mapeamento.ts `converterLinha`).
 *
 * `codigoEhPlacaPrincipal` (só importa pra mensalistas): no ESTAEMPR do
 * legado, o "código" do mensalista É a placa do veículo principal dele — sem
 * cadastrar esse veículo em `mensalista_veiculos`, o mensalista não seria
 * reconhecido entrando no pátio com o carro principal (só com os extras).
 */
export async function importarDestino({ perfil, destino, colunas, linhas, codigoEhPlacaPrincipal = false }) {
  const { validas, erros } = separarValidas(colunas, linhas);
  const resultado = { criados: 0, ignorados: 0, erros };

  const { data: existentesData, error: errExistentes } = await supabase
    .from(destino.tabela).select('codigo').eq('filial_id', perfil.filial_id);
  if (errExistentes) { resultado.erros.push({ linha: 0, motivo: `Erro ao consultar cadastros existentes: ${errExistentes.message}` }); return resultado; }
  const codigosExistentes = new Set((existentesData || []).map((r) => r.codigo));

  const novas = [];
  for (const linha of validas) {
    if (codigosExistentes.has(linha.codigo)) { resultado.ignorados++; continue; }
    novas.push(linha);
    codigosExistentes.add(linha.codigo); // protege contra códigos duplicados dentro do próprio arquivo
  }

  for (const lote of emLotes(novas, TAMANHO_LOTE)) {
    // `modelo` (só existe nas colunas de mensalistas, ver mapeamento.ts) é do
    // veículo principal, não da pessoa — não é coluna de `mensalistas`.
    // Guarda à parte por código antes de tirar do payload, pra usar em
    // importarVeiculoPrincipal.
    const modeloPorCodigo = new Map(lote.map((linha) => [linha.codigo, linha.modelo]));
    const payload = lote.map((linha) => {
      const { modelo, ...resto } = linha;
      return { ...resto, filial_id: perfil.filial_id };
    });
    const { data: inseridos, error } = await supabase.from(destino.tabela).insert(payload).select('id, codigo');
    if (error) {
      lote.forEach((linha) => resultado.erros.push({ linha: linha.codigo, motivo: error.message }));
      continue;
    }
    resultado.criados += inseridos.length;

    if (destino.tabela === 'mensalistas' && codigoEhPlacaPrincipal) {
      await importarVeiculoPrincipal({ perfil, inseridos, modeloPorCodigo, resultado });
    }
  }

  return resultado;
}

/** Cadastra o próprio código do mensalista (= placa do veículo principal) em mensalista_veiculos. */
async function importarVeiculoPrincipal({ perfil, inseridos, modeloPorCodigo, resultado }) {
  const candidatas = inseridos
    .map((r) => ({ mensalista_id: r.id, placa: String(r.codigo || '').trim().toUpperCase(), modelo: modeloPorCodigo?.get(r.codigo) || null }))
    .filter((c) => c.placa);
  if (!candidatas.length) return;

  const [{ data: jaExistem }, catalogo] = await Promise.all([
    supabase.from('mensalista_veiculos').select('placa').eq('filial_id', perfil.filial_id),
    catalogoTabelaPorModelo(perfil.filial_id),
  ]);
  const placasExistentes = new Set((jaExistem || []).map((r) => r.placa));

  const payload = [];
  for (const c of candidatas) {
    if (placasExistentes.has(c.placa)) {
      resultado.erros.push({ linha: c.placa, motivo: 'Veículo principal: placa já cadastrada (nesta ou noutra filial) — cadastre manualmente se for o caso.' });
      continue;
    }
    placasExistentes.add(c.placa);
    payload.push({
      filial_id: perfil.filial_id, mensalista_id: c.mensalista_id, placa: c.placa, modelo: c.modelo,
      tipo_veic: catalogo.get(normalizar(c.modelo)) || null,
    });
  }
  if (!payload.length) return;

  const { error } = await supabase.from('mensalista_veiculos').insert(payload);
  if (error) resultado.erros.push({ linha: 0, motivo: `Veículo principal: ${error.message}` });
}

/**
 * Importação "veículos extra" (ESTASUBS): não cria mensalista — cada linha
 * vira um veículo de um mensalista que JÁ existe, achado por `codigo_mestre`
 * (CARMESTRE, o código/placa principal dele). Sem o mensalista já cadastrado,
 * a linha vira erro (não tem onde pendurar o veículo).
 */
export async function importarVeiculosExtras({ perfil, linhas, colunas }) {
  const { validas, erros } = separarValidas(colunas, linhas);
  const resultado = { criados: 0, ignorados: 0, erros };
  if (!validas.length) return resultado;

  const [{ data: mensalistasData, error: errMens }, { data: jaExistem }, catalogo] = await Promise.all([
    supabase.from('mensalistas').select('id, codigo').eq('filial_id', perfil.filial_id),
    supabase.from('mensalista_veiculos').select('placa').eq('filial_id', perfil.filial_id),
    catalogoTabelaPorModelo(perfil.filial_id),
  ]);
  if (errMens) { resultado.erros.push({ linha: 0, motivo: `Erro ao consultar mensalistas: ${errMens.message}` }); return resultado; }
  const idPorCodigo = new Map((mensalistasData || []).map((m) => [m.codigo, m.id]));
  const placasExistentes = new Set((jaExistem || []).map((r) => r.placa));

  const payload = [];
  for (const linha of validas) {
    const p = String(linha.placa || '').trim().toUpperCase();
    const mensalistaId = idPorCodigo.get(linha.codigo_mestre);
    if (!mensalistaId) {
      resultado.erros.push({ linha: linha.codigo_mestre, motivo: `Mensalista "${linha.codigo_mestre}" não encontrado — importe os mensalistas (ESTAEMPR) primeiro.` });
      continue;
    }
    if (placasExistentes.has(p)) { resultado.ignorados++; continue; }
    placasExistentes.add(p);
    payload.push({
      filial_id: perfil.filial_id, mensalista_id: mensalistaId, placa: p, modelo: linha.modelo || null,
      tipo_veic: catalogo.get(normalizar(linha.modelo)) || null,
    });
  }

  for (const lote of emLotes(payload, TAMANHO_LOTE)) {
    const { error } = await supabase.from('mensalista_veiculos').insert(lote);
    if (error) { lote.forEach((l) => resultado.erros.push({ linha: l.placa, motivo: error.message })); continue; }
    resultado.criados += lote.length;
  }

  return resultado;
}
