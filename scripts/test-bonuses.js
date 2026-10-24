// Prueba la lectura de bonos de la noche con la página de Wikipedia de un evento ya terminado
import { fetchBonusLines, parseBonuses } from './bonuses.js';
const page = process.argv[2] || 'UFC Fight Night: Buckley vs. Malott';
const lines = await fetchBonusLines(page);
const names = [...new Set(lines.join(' ').split(/[,:;]| and | vs\.? /).map((s) => s.trim()).filter((s) => /^[A-Z][a-z]+ [A-Z]/.test(s)))];
const found = parseBonuses(lines, names.map((n) => ({ id: n, name: n })));
console.log('::notice::' + page + ' · líneas: ' + lines.join(' | ').slice(0, 300));
console.log('::notice::Detectados: ' + found.map((b) => `${b.fighter_id} (${b.label} +${b.pts})`).join(', '));
