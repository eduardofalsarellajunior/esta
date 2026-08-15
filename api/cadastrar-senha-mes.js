// Vercel Function (Node.js) — cadastra, remove ou conta a fila de até 6
// "senhas do mês" da filial (ver supabase/migrations/0026_senha_mes.sql).
// Qualquer usuário ativo da filial pode usar — quem recebe a senha do
// Eduardo por WhatsApp digita ela mesma aqui, sem precisar do fornecedor.
// `{ acao: 'contar' }` devolve quantas já tem na fila; `{ acao: 'remover_ultima' }`
// desfaz a mais recente (typo); sem `acao`, `{ senha }` cadastra mais uma.
//
// Nunca confirma se a senha cadastrada "bate" com o esperado — isso
// vazaria informação pra quem não deveria ter (ver api/conferir-senha-mes.js
// e o comentário no topo de src/lib/senhaMes.js).
import { createClient } from '@supabase/supabase-js';

const MAX_FILA = 6;
const FORMATO_SENHA = /^[A-Z]{5}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ erro: 'Método não suportado.' }); return; }

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) { res.status(401).json({ erro: 'Faça login no app.' }); return; }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    res.status(500).json({ erro: 'Senha do mês não configurada (falta SUPABASE_SERVICE_ROLE_KEY nas Environment Variables do Vercel).' });
    return;
  }

  const comoUsuario = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: sessao, error: errSessao } = await comoUsuario.auth.getUser();
  if (errSessao || !sessao?.user) { res.status(401).json({ erro: 'Sessão inválida — faça login de novo.' }); return; }

  const { data: meuPerfil } = await comoUsuario.from('perfis')
    .select('filial_id, filial_ativa, ativo').eq('id', sessao.user.id).maybeSingle();
  if (!meuPerfil?.ativo) { res.status(403).json({ erro: 'Usuário inativo.' }); return; }
  const filialId = meuPerfil.filial_ativa || meuPerfil.filial_id;

  const admin = createClient(process.env.VITE_SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { acao } = req.body || {};

  if (acao === 'contar') {
    const { count } = await admin.from('senhas_mes_fila')
      .select('id', { count: 'exact', head: true }).eq('filial_id', filialId);
    res.status(200).json({ count: count || 0 });
    return;
  }

  if (acao === 'remover_ultima') {
    const { data: ultima } = await admin.from('senhas_mes_fila')
      .select('id').eq('filial_id', filialId).order('criado_em', { ascending: false }).limit(1).maybeSingle();
    if (!ultima) { res.status(400).json({ erro: 'Fila vazia — nada pra remover.' }); return; }
    await admin.from('senhas_mes_fila').delete().eq('id', ultima.id);
    res.status(200).json({ ok: true });
    return;
  }

  const senha = String(req.body?.senha || '').trim().toUpperCase();
  if (!FORMATO_SENHA.test(senha)) {
    res.status(400).json({ erro: 'Senha do mês precisa ter 5 letras (A-Z).' });
    return;
  }

  const { count } = await admin.from('senhas_mes_fila')
    .select('id', { count: 'exact', head: true }).eq('filial_id', filialId);
  if ((count || 0) >= MAX_FILA) {
    res.status(400).json({ erro: `Fila cheia (${MAX_FILA} senhas). Aguarde uma ser usada antes de cadastrar outra.` });
    return;
  }

  await admin.from('senhas_mes_fila').insert({ filial_id: filialId, senha });
  res.status(200).json({ ok: true, count: (count || 0) + 1 });
}
