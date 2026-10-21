// Prueba: récords de algunos luchadores desde Wikipedia (sin tocar la base de datos)
import { recordsFor } from './records.js';
const log = (m) => console.log(process.env.GITHUB_ACTIONS ? '::notice::' + m : m);
const names = (process.argv[2] || 'Alexander Volkanovski,Movsar Evloev,Petr Yan,Merab Dvalishvili,Lone\'er Kavanagh,Nurullo Aliev,Iasmin Lucindo,Colby Thicknesse').split(',');
const out = [];
for (const n of names) { const r = await recordsFor(n).catch((e) => ({ error: e.message })); out.push(`${n}: ${r ? JSON.stringify(r) : 'sin página'}`); }
log(out.join(' || '));
