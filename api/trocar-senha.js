// Vercel Function (Node.js) — troca a senha de login (Supabase Auth) de um
// usuário já existente. Mesmo motivo de api/criar-usuario.js: só dá pra
// mexer em auth.users com a chave de service_role, que nunca pode ir pro
// navegador.
//
// Variáveis de ambiente exigidas (mesmas de api/criar-usuario.js):
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ erro: 'Método não suportado.' }); return; }

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) { res.status(401).json({ erro: 'Faça login no app.' }); return; }

  const { userId, senha } = req.body || {};
  if (!userId || !senha) { res.status(400).json({ erro: 'Usuário e senha são obrigatórios.' }); return; }
  if (String(senha).length < 6) { res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' }); return; }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    res.status(500).json({ erro: 'Troca de senha não configurada (falta SUPABASE_SERVICE_ROLE_KEY nas Environment Variables do Vercel). Enquanto isso dá pra trocar no painel do Supabase (Authentication → Users).' });
    return;
  }

  // 1) Quem está pedindo? Client com o token de quem chamou, RLS normal —
  // não dá pra confiar em nada que venha no corpo da requisição.
  const comoUsuario = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: sessao, error: errSessao } = await comoUsuario.auth.getUser();
  if (errSessao || !sessao?.user) { res.status(401).json({ erro: 'Sessão inválida — faça login de novo.' }); return; }

  const { data: meuPerfil } = await comoUsuario.from('perfis')
    .select('filial_id, filial_ativa, papel, ativo').eq('id', sessao.user.id).maybeSingle();
  const ehFornecedor = meuPerfil?.papel === 'fornecedor';
  if (!meuPerfil?.ativo || !(ehFornecedor || meuPerfil.papel === 'supervisor')) {
    res.status(403).json({ erro: 'Só supervisor pode trocar a senha de um usuário.' });
    return;
  }

  const admin = createClient(process.env.VITE_SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2) O alvo precisa estar na mesma filial de quem pediu (pro fornecedor, a
  // que ele está operando agora) — sem isso, um supervisor de uma filial
  // conseguiria trocar a senha de alguém de outra. Só o fornecedor mexe na
  // senha de outro fornecedor (mesmo espírito do trigger perfis_guarda_papel).
  const { data: alvo } = await admin.from('perfis').select('filial_id, papel').eq('id', userId).maybeSingle();
  if (!alvo) { res.status(404).json({ erro: 'Usuário não encontrado.' }); return; }
  const filialDestino = meuPerfil.filial_ativa || meuPerfil.filial_id;
  if (alvo.filial_id !== filialDestino) { res.status(403).json({ erro: 'Esse usuário não é desta filial.' }); return; }
  if (alvo.papel === 'fornecedor' && !ehFornecedor) {
    res.status(403).json({ erro: 'Só o fornecedor pode trocar a senha de outro fornecedor.' });
    return;
  }

  const { error: errTrocar } = await admin.auth.admin.updateUserById(userId, { password: senha });
  if (errTrocar) { res.status(400).json({ erro: `Não deu pra trocar a senha: ${errTrocar.message}` }); return; }

  res.status(200).json({ ok: true });
}
