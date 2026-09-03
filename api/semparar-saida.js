// Vercel Function (Node.js) — chama Recebe e depois Confirma do Sem Parar
// quando o operador escolhe "Sem Parar" nas formas de pagamento da saída
// (ver src/telas/Patio.jsx/confirmarSaida). NUNCA roda sozinho: só é
// chamada quando o operador aciona essa forma explicitamente. Escolhendo
// qualquer outra forma, o Sem Parar simplesmente não é usado — não existe
// endpoint pra "desistir" de uma mera autorização (Cancela só vale numa
// transação já confirmada, e dentro de 10 min — não implementado nesta fase).
//
// Variáveis de ambiente: mesmas de api/semparar-autoriza.js.
import { createClient } from '@supabase/supabase-js';
import { dataHoraLocalISO } from '../src/lib/tempo.js';

const BASE_PADRAO = 'https://homolog.apisemparar.com.br';

// Códigos de retorno do manual (item 3) — só os que pedem uma frase própria;
// os demais caem no genérico "Sem Parar recusou (código N)".
const MOTIVOS = {
  3: 'Estabelecimento inválido junto ao Sem Parar — confira o código em Configurações.',
  6: 'Erro genérico do Sem Parar.',
  12: 'Hash do estabelecimento inválido — confira em Configurações.',
  14: 'NSU inválido.',
  17: 'O cliente cancelou o pagamento pelo app Sem Parar — escolha outra forma de pagamento.',
  57: 'Não autorizado pelo Sem Parar (ou o cancelamento excedeu o prazo).',
  58: 'Transação não autorizada pelo Sem Parar.',
  59: 'Token inválido ou vencido — peça pro veículo reentrar no pátio pra gerar um novo.',
  62: 'Placa inválida junto ao Sem Parar.',
  63: 'NSU já utilizado — tente de novo.',
  82: 'Dados inválidos enviados ao Sem Parar.',
  93: 'Token já utilizado — este veículo já foi cobrado por Sem Parar antes.',
};
const motivoDoCodigo = (c) => MOTIVOS[c] || `Sem Parar recusou (código ${c}).`;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ erro: 'Método não suportado.' }); return; }

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) { res.status(401).json({ erro: 'Faça login no app.' }); return; }

  const { movimentoId, valor, dtSaida, hrSaida } = req.body || {};
  if (!movimentoId || !(Number(valor) > 0) || !dtSaida || hrSaida == null) {
    res.status(400).json({ erro: 'movimentoId, valor, dtSaida e hrSaida são obrigatórios.' });
    return;
  }

  const apiKey = process.env.SEMPARAR_API_KEY;
  if (!apiKey) { res.status(500).json({ erro: 'Sem Parar não configurado (falta SEMPARAR_API_KEY nas Environment Variables do Vercel).' }); return; }
  const baseUrl = process.env.SEMPARAR_BASE_URL || BASE_PADRAO;

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });

  const { data: mov, error: errMov } = await supabase.from('movimentos').select('*').eq('id', movimentoId).maybeSingle();
  if (errMov) { res.status(500).json({ erro: errMov.message }); return; }
  if (!mov) { res.status(404).json({ erro: 'Movimento não encontrado (ou fora da sua filial).' }); return; }

  const { data: filial, error: errFilial } = await supabase.from('filiais')
    .select('config').eq('id', mov.filial_id).maybeSingle();
  if (errFilial || !filial) { res.status(500).json({ erro: errFilial?.message || 'Filial não encontrada.' }); return; }
  const cfg = filial.config?.semparar || {};
  if (!cfg.ativo || !cfg.codigoEstabelecimento || !cfg.hash) {
    res.status(400).json({ erro: 'Sem Parar não está configurado/ligado nesta filial.' });
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    codigoEstabelecimento: cfg.codigoEstabelecimento,
    hash: cfg.hash,
  };

  try {
    // Retomando um "recebido" anterior (o Confirma tinha falhado numa
    // tentativa passada): pula direto pra Confirma, sem gerar NSU nem chamar
    // Recebe de novo — reenviar Recebe arriscaria "NSU já utilizado" (63).
    let transactionId = mov.semparar_status === 'recebido' ? mov.semparar_transaction_id : null;
    let nsu = mov.semparar_nsu;

    if (!transactionId) {
      if (mov.semparar_status !== 'autorizado') {
        res.status(400).json({ ok: false, erro: 'Esta placa não tem autorização Sem Parar válida.' });
        return;
      }
      const { data: nsuGerado, error: errNsu } = await supabase.rpc('proximo_nsu_semparar', {
        p_filial: mov.filial_id, p_codigo_estabelecimento: cfg.codigoEstabelecimento,
      });
      if (errNsu) { res.status(500).json({ erro: errNsu.message }); return; }
      nsu = nsuGerado;

      const respRecebe = await fetch(`${baseUrl}/aucloud/v1/estacione/informatizado/recebe`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cdNSU: nsu,
          dataEntrada: dataHoraLocalISO(mov.dt_entrada, Number(mov.hr_entrada)),
          dataSaida: dataHoraLocalISO(dtSaida, Number(hrSaida)),
          token: mov.semparar_token,
          numeroTicket: mov.controle || 0,
          placaVeiculo: mov.placa,
          ...(mov.semparar_sticker ? { sticker: mov.semparar_sticker } : {}),
          valorTransacao: Number(valor),
          tipoTransacao: 'Estadia',
        }),
      });
      const corpoRecebe = await respRecebe.json().catch(() => ({}));
      const dadosRecebe = corpoRecebe?.dados || {};
      const codigoRecebe = Number(dadosRecebe.codigoRetorno);

      if (codigoRecebe !== 0) {
        await supabase.from('movimentos').update({
          semparar_status: codigoRecebe === 17 ? 'negado' : 'erro', semparar_nsu: nsu,
        }).eq('id', mov.id);
        res.status(200).json({ ok: false, codigoRetorno: codigoRecebe, erro: motivoDoCodigo(codigoRecebe) });
        return;
      }
      transactionId = dadosRecebe.transactionID;
      // Guarda o transactionID JÁ AQUI — se o Confirma falhar/der timeout
      // logo abaixo, uma nova tentativa retoma daqui, sem repetir o Recebe.
      await supabase.from('movimentos').update({
        semparar_status: 'recebido', semparar_transaction_id: transactionId, semparar_nsu: nsu, semparar_valor: Number(valor),
      }).eq('id', mov.id);
    }

    const respConfirma = await fetch(`${baseUrl}/aucloud/v1/estacione/informatizado/confirma`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ transactionID: transactionId }),
    });
    const corpoConfirma = await respConfirma.json().catch(() => ({}));
    const dadosConfirma = corpoConfirma?.dados || {};
    const codigoConfirma = Number(dadosConfirma.codigoRetorno);

    // 94 = retransmissão (já confirmado antes) — trata como sucesso, é
    // exatamente o caso de retomar depois de um timeout no Confirma.
    if (codigoConfirma !== 0 && codigoConfirma !== 94) {
      res.status(200).json({
        ok: false, codigoRetorno: codigoConfirma,
        erro: `Recebido pelo Sem Parar mas a confirmação falhou (${motivoDoCodigo(codigoConfirma)}) — tente de novo, não cobra em dobro.`,
      });
      return;
    }

    await supabase.from('movimentos').update({
      semparar_status: 'confirmado', semparar_transaction_id: transactionId, semparar_nsu: nsu, semparar_valor: Number(valor),
    }).eq('id', mov.id);
    res.status(200).json({ ok: true, transactionId, nsu });
  } catch (e) {
    res.status(200).json({ ok: false, erro: `Falha de comunicação com o Sem Parar: ${String(e?.message || e)}` });
  }
}
