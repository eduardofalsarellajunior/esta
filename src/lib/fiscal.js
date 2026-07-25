// Geração de RPS/NFS-e no Padrão Nacional (simplificado).
// ⚠️ A ASSINATURA DIGITAL (XMLDSig com certificado A1/A3) e a TRANSMISSÃO ao
// webservice da NFS-e são etapas EXTERNAS (exigem certificado). Aqui montamos
// o documento e o XML representativo; o status fica 'gerada' até o envio.

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Monta um XML representativo do DPS (Declaração de Prestação de Serviço) do Padrão Nacional. */
export function gerarXmlDPS({ nota, filial }) {
  const cfg = filial.config?.nfse || {};
  const tomador = nota.tomador || {};
  const doc = (tomador.cpf_cnpj || '').replace(/\D/g, '');
  const tagDoc = doc.length > 11 ? 'CNPJ' : 'CPF';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DPS versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse">',
    '  <infDPS>',
    `    <tpAmb>2</tpAmb>`,  // 2 = homologação
    `    <serie>${esc(nota.serie || cfg.serie || '1')}</serie>`,
    `    <nDPS>${esc(nota.numero_rps || '')}</nDPS>`,
    '    <prest>',
    `      <CNPJ>${esc((filial.cnpj || '').replace(/\D/g, ''))}</CNPJ>`,
    `      <IM>${esc(filial.inscricao_mun || '')}</IM>`,
    `      <xNome>${esc(filial.razao_social)}</xNome>`,
    '    </prest>',
    '    <toma>',
    `      <${tagDoc}>${esc(doc)}</${tagDoc}>`,
    `      <xNome>${esc(tomador.nome || 'CONSUMIDOR')}</xNome>`,
    '    </toma>',
    '    <serv>',
    `      <cTribNac>${esc(cfg.cnae || '')}</cTribNac>`,
    `      <xDescServ>${esc(nota.descricao || 'Estacionamento de veículo')}</xDescServ>`,
    '    </serv>',
    '    <valores>',
    `      <vServ>${Number(nota.valor || 0).toFixed(2)}</vServ>`,
    `      <pAliqAplic>${Number(nota.aliquota_iss || cfg.perc_iss || 0).toFixed(4)}</pAliqAplic>`,
    `      <vISS>${Number(nota.valor_iss || 0).toFixed(2)}</vISS>`,
    '    </valores>',
    '  </infDPS>',
    '</DPS>',
  ].join('\n');
}

/** Próximo número de RPS por (filial, série) — read-modify-write (1 operador). */
export async function proximoNumeroRps(supabase, filialId, serie) {
  const { data } = await supabase.from('fiscal_sequencias')
    .select('proximo').eq('filial_id', filialId).eq('serie', serie).maybeSingle();
  if (!data) {
    await supabase.from('fiscal_sequencias').insert({ filial_id: filialId, serie, proximo: 2 });
    return 1;
  }
  const n = data.proximo;
  await supabase.from('fiscal_sequencias').update({ proximo: n + 1 }).eq('filial_id', filialId).eq('serie', serie);
  return n;
}
