// Vercel Function (Node.js) — assina o DPS e envia pra ADN (Sistema Nacional
// NFS-e). Só existe aqui porque precisa do certificado digital (mTLS) e de
// assinatura XMLDSig — nada disso pode rodar no navegador.
//
// Variáveis de ambiente exigidas (Vercel -> Project Settings -> Environment
// Variables; nunca comitar, nunca colar num chat):
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY   (já configuradas pro app)
//   NFSE_CERTIFICADO_PFX_B64                     (o .pfx inteiro, em base64)
//   NFSE_CERTIFICADO_SENHA                       (senha do .pfx)
import { createClient } from '@supabase/supabase-js';
import { gerarXmlDPS, gerarXmlAbrasfLoteRps, parseAbrasfEnvioResposta } from '../src/lib/fiscal.js';
import { extrairChaveECertificado, assinarXmlDps, enviarDps, assinarLoteAbrasf, enviarAbrasf } from '../src/servidor/nfse.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ erro: 'Método não suportado.' }); return; }

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) { res.status(401).json({ erro: 'Faça login no app.' }); return; }

  const { notaId } = req.body || {};
  if (!notaId) { res.status(400).json({ erro: 'notaId é obrigatório.' }); return; }

  const pfxB64 = process.env.NFSE_CERTIFICADO_PFX_B64;
  const senha = process.env.NFSE_CERTIFICADO_SENHA;
  if (!pfxB64 || !senha) {
    res.status(500).json({ erro: 'Certificado não configurado (NFSE_CERTIFICADO_PFX_B64 / NFSE_CERTIFICADO_SENHA nas Environment Variables do Vercel).' });
    return;
  }

  // createClient com o token do usuário: as consultas abaixo respeitam a
  // mesma RLS por filial de sempre — a function não usa chave de serviço.
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });

  const { data: nota, error: errNota } = await supabase.from('notas_fiscais').select('*').eq('id', notaId).maybeSingle();
  if (errNota) { res.status(500).json({ erro: errNota.message }); return; }
  if (!nota) { res.status(404).json({ erro: 'Nota não encontrada (ou fora da sua filial).' }); return; }
  if (!['gerada', 'erro'].includes(nota.status)) {
    res.status(400).json({ erro: `Nota está "${nota.status}" — só é possível enviar quem está "gerada" (ou reenviar quem deu "erro").` });
    return;
  }

  const { data: filial, error: errFilial } = await supabase.from('filiais').select('*').eq('id', nota.filial_id).maybeSingle();
  if (errFilial || !filial) { res.status(500).json({ erro: errFilial?.message || 'Filial não encontrada.' }); return; }

  const ambiente = filial.config?.nfse?.ambiente === 'producao' ? 'producao' : 'homologacao';
  const padrao = filial.config?.nfse?.padrao || 'padrao_nacional_campinas';

  // Padrão Nacional (ADN compartilhado) ainda não tem endpoint confirmado
  // pra Campinas (ver Configurações → Fiscal) — Padrão Nacional Campinas e
  // ABRASF já estão implementados.
  if (padrao === 'padrao_nacional') {
    res.status(501).json({ erro: 'Envio por Padrão Nacional (ADN compartilhado) ainda não está implementado no esta — troque pra "Padrão Nacional Campinas" ou "ABRASF" em Configurações → Fiscal.' });
    return;
  }

  try {
    const pfxBuffer = Buffer.from(pfxB64, 'base64');
    const { chavePem, certPem, certPemCadeia } = extrairChaveECertificado(pfxBuffer, senha);

    if (padrao === 'abrasf') {
      // Assíncrono: este envio só entrega o protocolo do lote. A nota (ou o
      // erro) só sai depois, via ConsultarLoteRps (api/consultar-nfse.js).
      const xml = gerarXmlAbrasfLoteRps({ nota, filial });
      const xmlAssinado = assinarLoteAbrasf(xml, { chavePem, certPemCadeia });
      const resposta = await enviarAbrasf({ metodo: 'RecepcionarLoteRps', xmlNegocio: xmlAssinado, ambiente, pfxBuffer, senha });
      const parsed = parseAbrasfEnvioResposta(resposta.corpo);

      if (resposta.status >= 200 && resposta.status < 300 && parsed.protocolo) {
        await supabase.from('notas_fiscais').update({
          status: 'enviada', xml: xmlAssinado, lote: parsed.protocolo, retorno: resposta.corpo,
        }).eq('id', nota.id);
        res.status(200).json({ ok: true, status: 'enviada', protocolo: parsed.protocolo, ambiente });
      } else {
        await supabase.from('notas_fiscais').update({ status: 'erro', xml: xmlAssinado, retorno: resposta.corpo }).eq('id', nota.id);
        res.status(200).json({ ok: false, status: 'erro', retorno: resposta.corpo, ambiente });
      }
      return;
    }

    // Gera de novo (não reaproveita nota.xml) pra sempre refletir a config
    // fiscal atual e um dhEmi fresco, mesmo que a nota já tivesse um XML antigo.
    const xml = gerarXmlDPS({ nota, filial });
    const xmlAssinado = assinarXmlDps(xml, { chavePem, certPem });

    const resposta = await enviarDps({ xmlAssinado, ambiente, pfxBuffer, senha });
    let corpo;
    try { corpo = JSON.parse(resposta.corpo); } catch { corpo = { bruto: resposta.corpo }; }

    if (resposta.status >= 200 && resposta.status < 300 && corpo.nfseXmlGZipB64) {
      await supabase.from('notas_fiscais').update({
        status: 'autorizada', xml: xmlAssinado,
        numero_nfse: corpo.chaveAcesso || null,
        retorno: JSON.stringify(corpo),
      }).eq('id', nota.id);
      res.status(200).json({ ok: true, status: 'autorizada', chaveAcesso: corpo.chaveAcesso, ambiente });
    } else {
      await supabase.from('notas_fiscais').update({
        status: 'erro', xml: xmlAssinado, retorno: JSON.stringify(corpo),
      }).eq('id', nota.id);
      res.status(200).json({ ok: false, status: 'erro', retorno: corpo, ambiente });
    }
  } catch (e) {
    const mensagem = String(e?.message || e);
    await supabase.from('notas_fiscais').update({ status: 'erro', retorno: mensagem }).eq('id', nota.id);
    res.status(200).json({ ok: false, status: 'erro', erro: mensagem, ambiente });
  }
}
