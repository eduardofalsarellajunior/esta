// Vercel Function (Node.js) — consulta o resultado de um lote ABRASF já
// enviado (RecepcionarLoteRps é assíncrono: o envio só devolve um protocolo,
// a nota ou o erro só saem aqui, via ConsultarLoteRps). Mesmo certificado
// (mTLS) do envio; ver api/gerar-nfse.js.
import { createClient } from '@supabase/supabase-js';
import { gerarXmlAbrasfConsulta, parseAbrasfConsultaResposta } from '../src/lib/fiscal.js';
import { extrairChaveECertificado, enviarAbrasf } from '../src/servidor/nfse.js';

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

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });

  const { data: nota, error: errNota } = await supabase.from('notas_fiscais').select('*').eq('id', notaId).maybeSingle();
  if (errNota) { res.status(500).json({ erro: errNota.message }); return; }
  if (!nota) { res.status(404).json({ erro: 'Nota não encontrada (ou fora da sua filial).' }); return; }
  if (nota.status !== 'enviada' || !nota.lote) {
    res.status(400).json({ erro: `Nota está "${nota.status}" — só é possível consultar quem está "enviada" com um protocolo (lote).` });
    return;
  }

  const { data: filial, error: errFilial } = await supabase.from('filiais').select('*').eq('id', nota.filial_id).maybeSingle();
  if (errFilial || !filial) { res.status(500).json({ erro: errFilial?.message || 'Filial não encontrada.' }); return; }

  const ambiente = filial.config?.nfse?.ambiente === 'producao' ? 'producao' : 'homologacao';

  try {
    const pfxBuffer = Buffer.from(pfxB64, 'base64');
    // A consulta não precisa de assinatura XMLDSig (o exemplo real do
    // Eduardo não tem `<Signature>`) — só mTLS com o certificado mesmo.
    extrairChaveECertificado(pfxBuffer, senha); // valida cedo se a senha/pfx estão certos
    const xmlConsulta = gerarXmlAbrasfConsulta({ filial, protocolo: nota.lote });
    const resposta = await enviarAbrasf({ metodo: 'ConsultarLoteRps', xmlNegocio: xmlConsulta, ambiente, pfxBuffer, senha });
    const parsed = parseAbrasfConsultaResposta(resposta.corpo);

    if (parsed.situacao === 4 && parsed.numeroNfse) {
      await supabase.from('notas_fiscais').update({
        status: 'autorizada', numero_nfse: parsed.numeroNfse, retorno: resposta.corpo,
      }).eq('id', nota.id);
      res.status(200).json({ ok: true, status: 'autorizada', numeroNfse: parsed.numeroNfse, codigoVerificacao: parsed.codigoVerificacao, ambiente });
    } else if (parsed.situacao === 3) {
      await supabase.from('notas_fiscais').update({ status: 'erro', retorno: resposta.corpo }).eq('id', nota.id);
      res.status(200).json({ ok: false, status: 'erro', retorno: resposta.corpo, mensagens: parsed.mensagens, ambiente });
    } else {
      // 1 (não recebido) ou 2 (não processado) — ainda processando, tenta de novo depois.
      await supabase.from('notas_fiscais').update({ retorno: resposta.corpo }).eq('id', nota.id);
      res.status(200).json({ ok: true, status: 'enviada', situacao: parsed.situacao, ambiente });
    }
  } catch (e) {
    const mensagem = String(e?.message || e);
    res.status(200).json({ ok: false, status: 'enviada', erro: mensagem, ambiente });
  }
}
