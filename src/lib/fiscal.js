// Geração de RPS/NFS-e no Padrão Nacional (Sistema Nacional NFS-e / ADN).
// A ASSINATURA (XMLDSig) e o ENVIO (mTLS) ficam em api/gerar-nfse.js (Node,
// no Vercel — precisa do certificado, que não roda no navegador). Aqui só
// montamos o XML; o status fica 'gerada' até o envio.

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pad(v, len) {
  return String(v ?? '').replace(/\D/g, '').padStart(len, '0').slice(-len);
}

/**
 * Id do `infDPS` (45 caracteres: "DPS" + município IBGE(7) + tipo de
 * inscrição federal(1, "1"=CNPJ) + CNPJ(14) + série(5) + número(15)) — é o
 * que a assinatura XMLDSig referencia, por isso precisa estar certo.
 */
export function idInfDps({ filial, nota }) {
  const municipio = pad(filial.cod_ibge, 7);
  const cnpj = pad(filial.cnpj, 14);
  const serie = pad(nota.serie, 5);
  const numero = pad(nota.numero_rps, 15);
  return `DPS${municipio}1${cnpj}${serie}${numero}`;
}

// Data/hora local de Brasília em ISO com offset explícito. O Brasil não usa
// mais horário de verão, então -03:00 fixo é seguro por ora.
function agoraISOComFuso() {
  const local = new Date(Date.now() - 3 * 3600000);
  return `${local.toISOString().slice(0, 19)}-03:00`;
}

/** Monta o XML do DPS (Declaração de Prestação de Serviço), Padrão Nacional v1.01. */
export function gerarXmlDPS({ nota, filial }) {
  const cfg = filial.config?.nfse || {};
  const tomador = nota.tomador || {};
  const doc = (tomador.cpf_cnpj || '').replace(/\D/g, '');
  const tagDoc = doc.length > 11 ? 'CNPJ' : 'CPF';
  const municipio = pad(filial.cod_ibge, 7);
  const tpAmb = cfg.ambiente === 'producao' ? '1' : '2'; // 1=produção, 2=homologação
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DPS versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse">',
    `  <infDPS Id="${esc(idInfDps({ filial, nota }))}">`,
    `    <tpAmb>${tpAmb}</tpAmb>`,
    `    <dhEmi>${esc(agoraISOComFuso())}</dhEmi>`,
    '    <verAplic>esta-1.0</verAplic>',
    `    <serie>${esc(nota.serie || cfg.serie || '1')}</serie>`,
    `    <nDPS>${esc(nota.numero_rps || '')}</nDPS>`,
    `    <dCompet>${esc(nota.competencia || '')}</dCompet>`,
    '    <tpEmit>1</tpEmit>',
    `    <cLocEmi>${esc(municipio)}</cLocEmi>`,
    '    <prest>',
    `      <CNPJ>${esc((filial.cnpj || '').replace(/\D/g, ''))}</CNPJ>`,
    `      <IM>${esc(filial.inscricao_mun || '')}</IM>`,
    `      <xNome>${esc(filial.razao_social)}</xNome>`,
    '      <end>',
    '        <endNac>',
    `          <cMun>${esc(municipio)}</cMun>`,
    `          <CEP>${esc(pad(filial.cep, 8))}</CEP>`,
    '        </endNac>',
    `        <xLgr>${esc(filial.endereco || '')}</xLgr>`,
    `        <nro>${esc(filial.numero || '')}</nro>`,
    `        <xBairro>${esc(filial.bairro || '')}</xBairro>`,
    '      </end>',
    '      <regTrib>',
    `        <opSimpNac>${esc(cfg.opSimpNac || '1')}</opSimpNac>`,
    '        <regEspTrib>0</regEspTrib>',
    '      </regTrib>',
    '    </prest>',
    '    <toma>',
    // Identificação é uma escolha obrigatória: CNPJ | CPF | NIF | cNaoNIF.
    // Sem documento (cliente avulso, comum em estacionamento) usa cNaoNIF=2
    // ("não exigibilidade do NIF") em vez de mandar CPF/CNPJ vazio.
    ...(doc ? [`      <${tagDoc}>${esc(doc)}</${tagDoc}>`] : ['      <cNaoNIF>2</cNaoNIF>']),
    `      <xNome>${esc(tomador.nome || 'CONSUMIDOR')}</xNome>`,
    '    </toma>',
    '    <serv>',
    '      <locPrest>',
    `        <cLocPrestacao>${esc(municipio)}</cLocPrestacao>`,
    '      </locPrest>',
    '      <cServ>',
    `        <cTribNac>${esc(cfg.codTribNacional || '')}</cTribNac>`,
    `        <xDescServ>${esc(nota.descricao || 'Estacionamento de veículo')}</xDescServ>`,
    '      </cServ>',
    '    </serv>',
    '    <valores>',
    '      <vServPrest>',
    `        <vServ>${Number(nota.valor || 0).toFixed(2)}</vServ>`,
    '      </vServPrest>',
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
