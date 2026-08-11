// Vercel Function (Node.js) — cria o login (Supabase Auth) e o perfil de um
// usuário novo numa tacada só. Existe aqui porque criar login exige a chave
// de service_role, que bypassa RLS inteira e por isso NUNCA pode ir pro
// navegador (nem como VITE_*, que entram no bundle).
//
// Variáveis de ambiente exigidas (Vercel → Project Settings → Environment
// Variables; nunca comitar, nunca colar num chat):
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY   (já configuradas pro app)
//   SUPABASE_SERVICE_ROLE_KEY                    (Supabase → Settings → API)
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ erro: 'Método não suportado.' }); return; }

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) { res.status(401).json({ erro: 'Faça login no app.' }); return; }

  const { email, senha, nome, papel = 'operador' } = req.body || {};
  if (!email || !senha || !nome) { res.status(400).json({ erro: 'E-mail, senha e nome são obrigatórios.' }); return; }
  if (String(senha).length < 6) { res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' }); return; }
  if (!['operador', 'gerente', 'supervisor', 'fornecedor'].includes(papel)) {
    res.status(400).json({ erro: 'Papel inválido.' }); return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    res.status(500).json({ erro: 'Criação de login não configurada (falta SUPABASE_SERVICE_ROLE_KEY nas Environment Variables do Vercel). Enquanto isso dá pra criar o login no painel do Supabase e vincular pelo UID.' });
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
    res.status(403).json({ erro: 'Só supervisor pode criar usuário.' });
    return;
  }
  // Fornecedor é quem mantém o sistema: só ele cria outro fornecedor. Esta
  // função usa service_role (bypassa RLS), então a checagem tem que ser aqui —
  // o trigger do banco não alcança.
  if (papel === 'fornecedor' && !ehFornecedor) {
    res.status(403).json({ erro: 'Só o fornecedor pode criar outro fornecedor.' });
    return;
  }

  // 2) Cria o login. A filial vem do perfil de quem pediu (nunca do corpo),
  // pra um supervisor não conseguir criar usuário em outra filial. Pro
  // fornecedor, é a filial que ele está operando no momento.
  const filialDestino = meuPerfil.filial_ativa || meuPerfil.filial_id;
  const admin = createClient(process.env.VITE_SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: criado, error: errCriar } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true,
  });
  if (errCriar) { res.status(400).json({ erro: `Não deu pra criar o login: ${errCriar.message}` }); return; }

  // 3) Cria o perfil. Se falhar, desfaz o login recém-criado — senão sobra um
  // login órfão que não consegue entrar no app (sem perfil) nem ser recriado
  // (e-mail já em uso).
  const { error: errPerfil } = await admin.from('perfis').insert({
    id: criado.user.id, filial_id: filialDestino, nome, papel, email, ativo: true,
  });
  if (errPerfil) {
    await admin.auth.admin.deleteUser(criado.user.id);
    res.status(500).json({ erro: `Login criado e desfeito porque o perfil falhou: ${errPerfil.message}` });
    return;
  }

  res.status(200).json({ ok: true, id: criado.user.id });
}
