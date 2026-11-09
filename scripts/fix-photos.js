// Quita de la base de datos las fotos equivocadas (homónimos) (ids por argumento)
import { createClient } from '@supabase/supabase-js';
const db = createClient('https://vizqrxhulaqzehtlnvpx.supabase.co', process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const ids = (process.argv[2] || 'tom-nolan,dakota-hope,francis-marshall,randy-brown').split(',');
const { error } = await db.from('fighters').update({ photo: null, photo_credit: null }).in('id', ids);
console.log('::notice::' + (error ? 'ERROR ' + error.message : 'Fotos quitadas: ' + ids.join(', ')));
