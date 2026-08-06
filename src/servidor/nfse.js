// Assinatura (XMLDSig) e transmissão (mTLS) do DPS pro Sistema Nacional NFS-e
// (ADN). SÓ roda em Node (Vercel Function, api/gerar-nfse.js) — nunca é
// importado por telas/componentes, então nunca entra no bundle do navegador.
// O certificado (.pfx) e a senha vêm de variável de ambiente, nunca do app.
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { gzipSync } from 'node:zlib';
import https from 'node:https';

/**
 * Extrai a chave privada (PEM) e o certificado (PEM) de um .pfx (PKCS#12).
 * Certificados A1 de verdade costumam trazer a cadeia inteira (o certificado
 * do titular + o(s) certificado(s) da AC emissora) dentro do mesmo .pfx — por
 * isso não basta pegar "o certificado que apareceu no arquivo": tem que ser
 * o que corresponde à chave privada extraída (mesmo módulo RSA).
 */
export function extrairChaveECertificado(pfxBuffer, senha) {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuffer.toString('binary')));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);

  let chave = null;
  const certificados = [];
  for (const safeContents of p12.safeContents) {
    for (const safeBag of safeContents.safeBags) {
      if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag || safeBag.type === forge.pki.oids.keyBag) {
        chave = safeBag.key;
      } else if (safeBag.type === forge.pki.oids.certBag) {
        certificados.push(safeBag.cert);
      }
    }
  }
  if (!chave || certificados.length === 0) throw new Error('Não achei chave privada e certificado no .pfx (senha errada ou arquivo inválido).');

  const certificado = certificados.length === 1
    ? certificados[0]
    : certificados.find((c) => c.publicKey.n.equals(chave.n)) || certificados[0];
  // O padrão de assinatura das notas fiscais brasileiras é "EndCertOnly":
  // só o certificado do titular vai na assinatura, nunca a cadeia da AC
  // (tentei incluir a cadeia inteira antes, mas o padrão exige o contrário).

  return {
    chavePem: forge.pki.privateKeyToPem(chave),
    certPem: forge.pki.certificateToPem(certificado),
  };
}

/**
 * Assina, com XMLDSig, o elemento identificado por `localName` (casado pelo
 * atributo Id dele): assinatura enveloped, canonicalização C14N padrão,
 * RSA-SHA1/SHA1 — é o que a documentação do padrão de assinatura das notas
 * fiscais brasileiras descreve (junto com EndCertOnly, ver
 * extrairChaveECertificado). Testei RSA-SHA256 antes por suposição; voltando
 * ao documentado. A assinatura é inserida como irmã, logo depois do elemento
 * assinado (então "último filho" do pai dele). Genérico o bastante pra
 * assinar `infDPS` (Padrão Nacional) ou `LoteRps` (ABRASF — ver
 * `assinarLoteAbrasf`).
 */
function assinarElementoPorLocalName(xml, { localName, chavePem, certPem }) {
  const xpath = `//*[local-name(.)='${localName}']`;
  const sig = new SignedXml({
    privateKey: chavePem,
    publicCert: certPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });
  sig.addReference({
    xpath,
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
  });
  sig.computeSignature(xml, { location: { reference: xpath, action: 'after' } });
  return sig.getSignedXml();
}

export function assinarXmlDps(xml, { chavePem, certPem }) {
  return assinarElementoPorLocalName(xml, { localName: 'infDPS', chavePem, certPem });
}

/**
 * O manual ABRASF 2.03 genérico (§3.2.3) descreve assinatura em dois passos
 * (RPS isolado, depois o lote) — mas a IMA rejeitou isso em teste real
 * ("Arquivo enviado com erro na assinatura"), e a thread do grupo
 * wsnfsecampinas é específica sobre Campinas: pra envio em lote
 * (`RecepcionarLoteRps`), assina-se só `LoteRps` — não
 * `InfDeclaracaoPrestacaoServico` isoladamente (isso seria só pro envio de
 * RPS único, método `GerarNfse`, que este app não usa).
 */
export function assinarLoteAbrasf(xmlLote, { chavePem, certPem }) {
  return assinarElementoPorLocalName(xmlLote, { localName: 'LoteRps', chavePem, certPem });
}

/** Gzip + base64 — formato exigido pela ADN pra tudo (envio e retorno). */
export function gzipBase64(texto) {
  return gzipSync(Buffer.from(texto, 'utf-8')).toString('base64');
}

// URLs do webservice próprio de Campinas (hospedado pela IMA), padrão
// "Padrão Nacional Campinas" — mesmo layout de XML/API do Sistema Nacional
// NFS-e, mas endpoint próprio da prefeitura (é o que o erro E0039 sinalizava
// quando se tentou o endpoint nacional compartilhado por engano). ABRASF e o
// endpoint nacional compartilhado (sefin.nfse.gov.br) ainda não têm URL
// confirmada pra Campinas — api/gerar-nfse.js bloqueia esses dois padrões
// antes de chegar aqui (ver `padrao` em filial.config.nfse).
const URL_POR_AMBIENTE = {
  homologacao: 'https://preprod-nfse.ima.sp.gov.br/notafiscal-adn-ws/api/adn/dps',
  producao: 'https://novanfse.campinas.sp.gov.br/notafiscal-adn-ws/api/adn/dps',
};

/**
 * Envia o DPS já assinado pra ADN via mTLS (o certificado autentica a própria
 * conexão HTTPS — não é um token). Resposta é síncrona: já vem com a NFS-e
 * autorizada, ou o erro/rejeição.
 */
export function enviarDps({ xmlAssinado, ambiente, pfxBuffer, senha }) {
  const url = URL_POR_AMBIENTE[ambiente] || URL_POR_AMBIENTE.homologacao;
  const agent = new https.Agent({ pfx: pfxBuffer, passphrase: senha });
  const corpo = JSON.stringify({ dpsXmlGZipB64: gzipBase64(xmlAssinado) });

  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', agent, headers: { 'Content-Type': 'application/json' } }, (resp) => {
      let dados = '';
      resp.on('data', (chunk) => { dados += chunk; });
      resp.on('end', () => {
        resolve({ status: resp.statusCode, corpo: dados });
      });
    });
    req.on('error', reject);
    req.write(corpo);
    req.end();
  });
}

// ABRASF 2.03 (Campinas) — webservice próprio da IMA (mesmo domínio do
// Padrão Nacional Campinas), mas protocolo SOAP 1.1, document/literal
// wrapped, confirmado pelo WSDL real (soapAction="" em todas as operações).
const URL_ABRASF_POR_AMBIENTE = {
  homologacao: 'https://homol-rps.ima.sp.gov.br/notafiscal-abrasfv203-ws/NotaFiscalSoap',
  producao: 'https://novanfse.campinas.sp.gov.br/notafiscal-abrasfv203-ws/NotaFiscalSoap',
};

/**
 * O corpo SOAP é `<Metodo xmlns="http://nfse.abrasf.org.br">{xmlNegocio}
 * </Metodo>` — sem prefixo de namespace nas tags de negócio (confirmado
 * pelos XMLs reais capturados do sistema legado, que não têm nenhum xmlns).
 * `xmlNegocio` já vem com a declaração `<?xml ...?>` de `gerarXmlAbrasf*`
 * (útil quando salvo/comparado isolado) — precisa sair daqui, porque só pode
 * existir uma no início do documento inteiro (o envelope SOAP).
 */
function envelopeSoapAbrasf(metodo, xmlNegocio) {
  const semDeclaracao = xmlNegocio.replace(/^\s*<\?xml[^>]*\?>\s*/, '');
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${metodo} xmlns="http://nfse.abrasf.org.br">${semDeclaracao}</${metodo}></soap:Body></soap:Envelope>`;
}

/**
 * Envia `xmlNegocio` (já assinado, quando o método exigir) pro webservice
 * ABRASF via SOAP + mTLS — mesmo certificado/mecanismo de `enviarDps` (o
 * manual ABRASF exige certificado digital tanto pra assinatura quanto pra
 * transmissão). `metodo`: "RecepcionarLoteRps" ou "ConsultarLoteRps".
 */
export function enviarAbrasf({ metodo, xmlNegocio, ambiente, pfxBuffer, senha }) {
  const url = URL_ABRASF_POR_AMBIENTE[ambiente] || URL_ABRASF_POR_AMBIENTE.homologacao;
  const agent = new https.Agent({ pfx: pfxBuffer, passphrase: senha });
  const corpo = envelopeSoapAbrasf(metodo, xmlNegocio);

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST', agent,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    }, (resp) => {
      let dados = '';
      resp.on('data', (chunk) => { dados += chunk; });
      resp.on('end', () => resolve({ status: resp.statusCode, corpo: dados }));
    });
    req.on('error', reject);
    req.write(corpo);
    req.end();
  });
}
