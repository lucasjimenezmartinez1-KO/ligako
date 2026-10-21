import { createClient } from '@supabase/supabase-js';

// La URL y la clave "anon" son públicas por diseño: la seguridad está en las reglas (RLS) de la base de datos.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://vizqrxhulaqzehtlnvpx.supabase.co';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_lUI5vonaUzj-6fPG6x_YVQ_CrCPDaSe';

export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

// Traduce los errores habituales a mensajes claros
export function errText(e) {
  const m = (e && (e.message || e.error_description || String(e))) || 'Algo ha fallado';
  if (/Invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos';
  if (/User already registered/i.test(m)) return 'Ya hay una cuenta con ese email. Inicia sesión.';
  if (/Password should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres';
  if (/Unable to validate email|invalid format/i.test(m)) return 'Ese email no es válido';
  if (/rate limit|security purposes/i.test(m)) return 'Has pedido demasiados correos seguidos. Espera unos minutos y vuelve a probar';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo';
  return m;
}
