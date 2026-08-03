// supabase/functions/ler-placa/index.ts
//
// Proxy para a API do Plate Recognizer (Snapshot Cloud): recebe a foto do
// app, chama a API com o token secreto (nunca exposto ao navegador) e devolve
// só o que a tela precisa. O operador sempre confirma a placa lida antes de
// usar — este endpoint só sugere, nunca preenche/grava nada por conta própria.
//
// Corpo esperado: multipart/form-data com o campo "imagem" (arquivo/foto).
// Resposta: { resultados: [{ placa, confianca, candidatos: [{placa, confianca}] }] }
//
// -----------------------------------------------------------------------------
// Deploy (rodar no terminal, com a Supabase CLI logada e o projeto linkado —
// o Code escreve isto, mas não executa; ver CLAUDE.md §5):
//
//   npx supabase login
//   npx supabase link --project-ref <ref-do-projeto>      (Project Settings -> General)
//   npx supabase functions deploy ler-placa
//   npx supabase secrets set PLATE_RECOGNIZER_TOKEN=xxxxxxxxxxxxxxxx
//
// O token vem do painel do Plate Recognizer (platerecognizer.com -> Snapshot
// Cloud -> API Token). Plano gratuito: ~2.500 leituras/mês, 1 leitura/segundo.
// -----------------------------------------------------------------------------

const PLATE_RECOGNIZER_URL = 'https://api.platerecognizer.com/v1/plate-reader/';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Só a assinatura do JWT já foi validada pelo runtime das Edge Functions
// (verify_jwt padrão); aqui só checamos se é um usuário logado (role
// "authenticated") e não a anon key pública — que fica exposta no bundle do
// app e não deve conseguir gastar a cota da API sozinha.
function ehUsuarioAutenticado(authHeader: string | null): boolean {
  try {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '');
    const payloadB64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(payloadB64));
    return payload.role === 'authenticated';
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ erro: 'Método não suportado.' }, 405);

  if (!ehUsuarioAutenticado(req.headers.get('Authorization'))) {
    return json({ erro: 'Faça login no app para usar o leitor de placas.' }, 401);
  }

  const token = Deno.env.get('PLATE_RECOGNIZER_TOKEN');
  if (!token) return json({ erro: 'PLATE_RECOGNIZER_TOKEN não configurado (supabase secrets set).' }, 500);

  let recebido: FormData;
  try {
    recebido = await req.formData();
  } catch {
    return json({ erro: 'Envie a foto como multipart/form-data (campo "imagem").' }, 400);
  }
  const imagem = recebido.get('imagem');
  if (!(imagem instanceof File)) return json({ erro: 'Campo "imagem" ausente ou inválido.' }, 400);
  if (imagem.size > 3 * 1024 * 1024) return json({ erro: 'Foto maior que 3MB — tente novamente (o app já reduz o tamanho).' }, 400);

  const envio = new FormData();
  envio.append('upload', imagem, imagem.name || 'placa.jpg');
  envio.append('regions', 'br'); // dica de formato (Mercosul/antiga) — não restringe a leitura

  let resp: Response;
  try {
    resp = await fetch(PLATE_RECOGNIZER_URL, { method: 'POST', headers: { Authorization: `Token ${token}` }, body: envio });
  } catch (e) {
    return json({ erro: `Falha ao contatar o Plate Recognizer: ${(e as Error).message}` }, 502);
  }

  if (resp.status === 429) return json({ erro: 'Limite de leituras por segundo atingido — aguarde um instante e tente de novo.' }, 429);
  if (!resp.ok) {
    const texto = await resp.text();
    return json({ erro: `Falha no reconhecimento (${resp.status}): ${texto.slice(0, 300)}` }, 502);
  }

  const dados = await resp.json();
  const resultados = (dados.results || []).map((r: any) => ({
    placa: String(r.plate || '').toUpperCase(),
    confianca: typeof r.score === 'number' ? r.score : null,
    candidatos: (r.candidates || [])
      .map((c: any) => ({ placa: String(c.plate || '').toUpperCase(), confianca: typeof c.score === 'number' ? c.score : null }))
      .filter((c: { placa: string }) => c.placa && c.placa !== String(r.plate || '').toUpperCase()),
  }));

  return json({ resultados });
});
