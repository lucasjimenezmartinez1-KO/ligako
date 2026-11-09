// Créditos de las fotos de unos luchadores
import { createClient } from '@supabase/supabase-js';
const db = createClient('https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const ids = (process.argv[2] || '').split(',');
for (const f of (await db.from('fighters').select('id,photo,photo_credit').in('id', ids)).data) console.log(`::notice::${f.id}: ${f.photo} · ${f.photo_credit}`);
