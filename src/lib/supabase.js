import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Se as variáveis não estiverem configuradas, o app mostra instruções em vez de quebrar.
export const configurado = Boolean(url && key);
export const supabase = configurado ? createClient(url, key) : null;
