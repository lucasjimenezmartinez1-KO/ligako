// Manda un aviso de prueba a los móviles de un usuario (por nombre) o, sin nombre, al último que activó los avisos
import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const name = (process.argv[2] || '').trim();
const { data: subs } = await sb.from('push_subs').select('user_id, created_at').order('created_at', { ascending: false });
const { data: profs } = await sb.from('profiles').select('id, username');
const nm = Object.fromEntries((profs || []).map((p) => [p.id, p.username]));
const target = name ? (subs || []).find((s) => (nm[s.user_id] || '').toLowerCase().includes(name.toLowerCase())) : (subs || [])[0];
if (!target) { console.log('::notice::Nadie con avisos activados' + (name ? ' llamado ' + name : '') + '. Con avisos: ' + [...new Set((subs || []).map((s) => nm[s.user_id]))].join(', ')); process.exit(0); }
const { error } = await sb.rpc('send_push', { p_user: target.user_id, p_title: '🔔 Prueba de Liga KO', p_body: 'Los avisos funcionan. Te avisaremos si te hacen un clausulazo.', p_tag: 'test' });
await new Promise((r) => setTimeout(r, 6000));
const { data: st } = await sb.rpc('push_status');
console.log(`::notice::Prueba a ${nm[target.user_id]}: ${error ? error.message : 'enviada'} · ${JSON.stringify(st?.last?.[0] || {})}`);
