import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Se as variáveis não estiverem configuradas, o app mostra instruções em vez de quebrar.
export const configurado = Boolean(url && key);

/**
 * Sessão só é salva em disco (sobrevive a fechar a janela ou dar F5) na
 * máquina fixa da cabine — marcada pelo próprio atalho (pdv-cabine.bat /
 * pdv-cabine-edge.bat, ver docs/CABINE.md), que abre com
 * `?dispositivo_fixo=1` na URL. Em qualquer outro navegador (PC do balcão,
 * notebook de visita a cliente), o padrão é NÃO guardar: fechar a aba ou
 * recarregar desloga sozinho, sem depender de ninguém lembrar de clicar em
 * "Sair" — o motivo é uma máquina usada por vários operadores ao longo do
 * dia não poder ficar "aberta" pro próximo que sentar ali.
 *
 * supabase-js não deixa escolher isso por chamada de login, só na criação
 * do client (`persistSession`) — por isso o `storage` abaixo decide
 * sozinho, a cada leitura/escrita, se vai pro localStorage de verdade ou só
 * pra este objeto em memória (que morre junto com a aba/recarregamento).
 */
const CHAVE_DISPOSITIVO_FIXO = 'esta_dispositivo_fixo';
try {
  if (new URLSearchParams(window.location.search).get('dispositivo_fixo') === '1') {
    localStorage.setItem(CHAVE_DISPOSITIVO_FIXO, 'true');
  }
} catch { /* localStorage indisponível — segue sem persistir, é o lado seguro */ }

function dispositivoFixo() {
  try { return localStorage.getItem(CHAVE_DISPOSITIVO_FIXO) === 'true'; } catch { return false; }
}

const memoria = {};
const storageCondicional = {
  getItem(k) {
    if (dispositivoFixo()) { try { return localStorage.getItem(k); } catch { return null; } }
    return memoria[k] ?? null;
  },
  setItem(k, v) {
    if (dispositivoFixo()) { try { localStorage.setItem(k, v); return; } catch { /* cai pra memória */ } }
    memoria[k] = v;
  },
  removeItem(k) {
    delete memoria[k];
    try { localStorage.removeItem(k); } catch { /* nada salvo, nada a remover */ }
  },
};

export const supabase = configurado ? createClient(url, key, {
  auth: { storage: storageCondicional, persistSession: true, autoRefreshToken: true },
}) : null;
