// Comprueba a dónde lleva el enlace de recuperar contraseña (sin enviar correo ni mostrar el enlace)
import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL || 'https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const email = process.argv[2];
const { data, error } = await db.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: 'https://ligako.vercel.app' } });
if (error) { log('Error: ' + error.message); process.exit(0); }
const u = new URL(data.properties.action_link);
log(`Servidor del enlace: ${u.host} · redirige a: ${u.searchParams.get('redirect_to')} · tipo: ${u.searchParams.get('type')}`);
