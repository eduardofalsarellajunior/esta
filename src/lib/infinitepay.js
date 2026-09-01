// InfiniteTap (Tap to Pay da InfinitePay): o celular do operador vira a
// maquininha — o cliente aproxima o cartão no próprio aparelho, sem leitor
// separado. Só CARTÃO (crédito/débito); Pix não faz parte dessa integração.
//
// A integração inteira é um DEEPLINK: o esta abre o app da InfinitePay já com
// valor/método/parcelas preenchidos, e o operador só aproxima o cartão. Não
// há API, chave nem webhook — ver docs/INFINITEPAY.md.
//
// ⚠️ Hoje o esta NÃO recebe o resultado de volta (o `result_url` da
// documentação exige um esquema de deeplink próprio de app nativo, que um
// PWA não tem). Por isso, depois de aproximar o cartão o operador volta pro
// esta na mão e confirma a saída normalmente — o ganho aqui é não digitar o
// valor na maquininha (e não errar de digitar).

const DEEPLINK = 'infinitepaydash://infinitetap-app';

/** Regras da InfinitePay: mínimo R$ 1,00 por parcela, no máximo 12 parcelas. */
export const VALOR_MINIMO = 1;
export const PARCELAS_MAX = 12;

/**
 * iPadOS 13+ se apresenta como "MacIntel" no userAgent — o número de pontos
 * de toque é o que separa um iPad de um Mac de verdade.
 */
export function ehIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Tap to Pay só existe no celular (é o NFC do aparelho lendo o cartão) — no
 * PC da cabine o botão não faz sentido nenhum e por isso nem aparece.
 */
export function ehCelular() {
  if (typeof navigator === 'undefined') return false;
  return ehIOS() || /Android/i.test(navigator.userAgent);
}

/** Configuração da filial (Configurações → fornecedor). */
export function configInfinitePay(filial) {
  const cfg = filial?.config?.infinitepay || {};
  return {
    ativo: !!cfg.ativo,
    handle: cfg.handle || '',
    // Confere se o app está logado na conta certa — o CNPJ do próprio
    // cadastro da filial já serve, não precisa digitar de novo.
    docNumber: String(filial?.cnpj || '').replace(/\D/g, ''),
  };
}

/** Máximo de parcelas que este valor comporta (cada uma >= R$ 1,00). */
export function parcelasPossiveis(valor) {
  return Math.max(1, Math.min(PARCELAS_MAX, Math.floor(Number(valor || 0) / VALOR_MINIMO)));
}

/**
 * Motivo pelo qual esta cobrança não pode ir pro InfiniteTap, ou null se
 * estiver tudo certo. Mensagem já pronta pra mostrar ao operador.
 */
export function motivoNaoPodeCobrar({ valor, metodo, parcelas = 1 }) {
  const v = Number(valor || 0);
  if (!metodo) return 'Essa forma de pagamento não está ligada ao InfiniteTap (ver Cadastros → Formas de pagamento).';
  if (v < VALOR_MINIMO) return `O InfiniteTap não aceita valor abaixo de ${VALOR_MINIMO.toFixed(2).replace('.', ',')}.`;
  if (metodo === 'credit' && parcelas > parcelasPossiveis(v)) {
    return `Esse valor comporta no máximo ${parcelasPossiveis(v)}x (cada parcela precisa ter pelo menos R$ 1,00).`;
  }
  return null;
}

/**
 * Monta o deeplink que abre o app da InfinitePay já preenchido.
 *
 * `orderId` é só rastreabilidade do lado deles (aparece no suporte e voltaria
 * no result_url quando/se o retorno automático existir) — passamos o id do
 * movimento/mensalidade/venda que originou a cobrança.
 */
export function linkInfiniteTap({ valor, metodo, parcelas = 1, orderId, config = {} }) {
  const params = new URLSearchParams();
  // `amount` é em CENTAVOS: 100 = R$ 1,00.
  params.set('amount', String(Math.round(Number(valor) * 100)));
  params.set('payment_method', metodo);
  if (metodo === 'credit') params.set('installments', String(parcelas || 1));
  if (orderId) params.set('order_id', String(orderId));
  // Sempre a mesma string, como a documentação pede — é como a InfinitePay
  // identifica de qual sistema veio a venda.
  params.set('app_client_referrer', 'esta');
  if (config.handle) params.set('handle', config.handle);
  if (config.docNumber) params.set('doc_number', config.docNumber);
  if (ehIOS()) params.set('af_force_deeplink', 'true');
  return `${DEEPLINK}?${params.toString()}`;
}

/** Abre o app da InfinitePay. Devolve o motivo do erro, ou null se abriu. */
export function cobrarNoInfiniteTap({ valor, metodo, parcelas = 1, orderId, config }) {
  const motivo = motivoNaoPodeCobrar({ valor, metodo, parcelas });
  if (motivo) return motivo;
  window.location.href = linkInfiniteTap({ valor, metodo, parcelas, orderId, config });
  return null;
}
