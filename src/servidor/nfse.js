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
 * Assina o elemento `infDPS` (identificado pelo atributo Id) com XMLDSig:
 * assinatura enveloped, canonicalização C14N padrão, RSA-SHA1/SHA1 — é o que
 * a documentação do padrão de assinatura das notas fiscais brasileiras
 * descreve (junto com EndCertOnly, ver extrairChaveECertificado). Testei
 * RSA-SHA256 antes por suposição; voltando ao documentado. A assinatura é
 * anexada como último filho de `DPS`.
 */
export function assinarXmlDps(xml, { chavePem, certPem }) {
  const sig = new SignedXml({
    privateKey: chavePem,
    publicCert: certPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });
  sig.addReference({
    xpath: "//*[local-name(.)='infDPS']",
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
  });
  sig.computeSignature(xml, {
    location: { reference: "//*[local-name(.)='infDPS']", action: 'after' },
  });
  return sig.getSignedXml();
}

/** Gzip + base64 — formato exigido pela ADN pra tudo (envio e retorno). */
export function gzipBase64(texto) {
  return gzipSync(Buffer.from(texto, 'utf-8')).toString('base64');
}

// Campinas ainda não usa o endpoint nacional compartilhado (sefin.nfse.gov.br)
// — mantém webservice próprio (hospedado pela IMA), seguindo o mesmo padrão
// nacional de API (é o que o erro E0039 sinalizava). Se um dia atender outra
// filial/município que já esteja no endpoint nacional, isso precisa virar
// uma escolha por filial em vez de uma constante fixa.
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
