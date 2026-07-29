// Controle de acesso por papel — só na camada de UI (rotas/menu); o banco
// (RLS) ainda isola apenas por filial, não por papel (pendência conhecida).
export const ROTAS_OPERADOR = ['/', '/caixa'];

export function podeAcessar(perfil, pathname) {
  if (perfil.papel === 'supervisor') return true;
  return ROTAS_OPERADOR.includes(pathname);
}
