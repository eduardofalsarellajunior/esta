// Assinatura (XMLDSig) e transmissão (mTLS) do DPS pro Sistema Nacional NFS-e
// (ADN). SÓ roda em Node (Vercel Function, api/gerar-nfse.js) — nunca é
// importado por telas/componentes, então nunca entra no bundle do navegador.
// O certificado (.pfx) e a senha vêm de variável de ambiente, nunca do app.
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { gzipSync } from 'node:zlib';
import https from 'node:https';

/** Extrai a chave privada (PEM) e o certificado (PEM) de um .pfx (PKCS#12). */
export function extrairChaveECertificado(pfxBuffer, senha) {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuffer.toString('binary')));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);

  let chave = null;
  let certificado = null;
  for (const safeContents of p12.safeContents) {
    for (const safeBag of safeContents.safeBags) {
      if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag || safeBag.type === forge.pki.oids.keyBag) {
        chave = safeBag.key;
      } else if (safeBag.type === forge.pki.oids.certBag) {
        certificado = safeBag.cert;
      }
    }
  }
  if (!chave || !certificado) throw new Error('Não achei chave privada e certificado no .pfx (senha errada ou arquivo inválido).');

  return {
    chavePem: forge.pki.privateKeyToPem(chave),
    certPem: forge.pki.certificateToPem(certificado),
  };
}

/**
 * Assina o elemento `infDPS` (identificado pelo atributo Id) com XMLDSig —
 * mesma receita das demais notas fiscais brasileiras (NF-e/CT-e): assinatura
 * enveloped, canonicalização C14N padrão, RSA-SHA1/SHA1. A assinatura é
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

const URL_POR_AMBIENTE = {
  homologacao: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional/nfse',
  producao: 'https://sefin.nfse.gov.br/SefinNacional/nfse',
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
