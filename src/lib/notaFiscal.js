import { gerarXmlDPS, gerarXmlAbrasfLoteRps, proximoNumeroRps } from './fiscal.js';

/**
 * Cria e grava uma nota fiscal (DPS ou RPS/DPS ABRASF), no padrão configurado
 * pra filial (`filial.config.nfse.padrao`). Compartilhado entre a saída do
 * pátio (Patio.jsx) e o recebimento de mensalidade (ReceberMensalidade.jsx) —
 * a única diferença entre os dois pontos de chamada é o `tomador` (e
 * `movimentoId`, null quando a origem é mensalidade, já que a coluna é
 * nullable).
 */
export async function criarNotaFiscal(supabase, { filialId, movimentoId = null, competencia, valor, descricao, tomador }) {
  const { data: filial, error: errFilial } = await supabase.from('filiais').select('*').eq('id', filialId).maybeSingle();
  if (errFilial || !filial) return { error: errFilial?.message || 'Filial não encontrada para gerar a nota fiscal.' };

  const cfg = filial.config?.nfse || {};
  const padrao = cfg.padrao || 'padrao_nacional_campinas';
  const serie = padrao === 'abrasf' ? (cfg.abrasf?.serie || '99') : (cfg.serie || '1');
  const percIss = padrao === 'abrasf' ? Number(cfg.abrasf?.percIss ?? cfg.perc_iss ?? 0) : Number(cfg.perc_iss || 0);
  const numero = await proximoNumeroRps(supabase, filialId, serie);

  const nota = {
    filial_id: filialId, movimento_id: movimentoId, numero_rps: numero, serie,
    competencia, descricao: descricao || 'Estacionamento de veículo',
    valor: Number(valor), aliquota_iss: percIss,
    valor_iss: Number((Number(valor) * percIss / 100).toFixed(2)),
    tomador, status: 'gerada',
  };
  nota.xml = padrao === 'abrasf' ? gerarXmlAbrasfLoteRps({ nota, filial }) : gerarXmlDPS({ nota, filial });

  const { error } = await supabase.from('notas_fiscais').insert(nota);
  return { error: error?.message || null };
}
