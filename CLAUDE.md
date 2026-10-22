# Liga KO (fantasy MMA)

App de fantasy de MMA para público hispanohablante, inspirada en LaLiga Fantasy y Biwenger. Nombre provisional: **Liga KO**.

## Principios

- **Idioma:** toda la app (interfaz, textos, notificaciones) en español.
- **Sin marcas:** no usar nombres, marcas, logos ni imágenes de UFC ni de otras promotoras. Los nombres de luchadores sí se pueden usar.
- **Fotos:** solo con licencia que permita uso comercial (ahora: Wikimedia Commons con crédito al autor). Nada de fotos de ufc.com, Getty sin licencia comercial ni Instagram.
- **No es una casa de apuestas:** no mostrar cuotas de apuestas ni usar lenguaje o estética de apuestas. Las predicciones solo dan dinero ficticio para el mercado.

## Luchadores

- Pool: los luchadores del **ranking oficial de UFC** (campeón + top 15 de las 11 divisiones, 176 luchadores) más los no clasificados que aparezcan en carteleras. En el prototipo, ranking del 10 de octubre de 2026.

## Ligas

- Ligas privadas de hasta **12 usuarios**.
- Los luchadores son **exclusivos dentro de cada liga**: un luchador solo puede pertenecer a un usuario de la liga.
- Un usuario puede jugar en **varias ligas** (cada una con su presupuesto, sorteo y fichajes). Se cambia tocando el nombre de la liga arriba (flecha solo si tiene más de una) o con "Jugar en otra liga" en la pestaña Liga; la app abre la última usada. Un enlace `?liga=CÓDIGO` abre el selector para unirse.

## Ciclo de cada evento (solo eventos numerados)

1. **Sorteo:** cuando todos pulsan "Estoy listo" se asigna al azar **un luchador de las preliminares a cada jugador**, gratis (el presupuesto baja un 25 % de su valor).
2. **Mercado por tandas:** tras el sorteo, el resto de luchadores sale al mercado en 3 tandas (mezcla de oro, plata y bronce) repartidas hasta el viernes 23:59. Pujas secretas (solo se ve cuántos han pujado): gana la más alta al cerrar su tanda (mínimo, el valor). Los que nadie ficha vuelven al mercado hasta el cierre. El sábado solo cláusulas.
   - El sorteo lo lanza el workflow "Sorteo de luchadores" cuando el usuario avisa; resta del presupuesto el 25 % del valor del luchador que toca.
3. **Fichar a un luchador de otro jugador:** solo de dos formas:
   - Oferta que el dueño acepta.
   - Pago de la **cláusula**: un 25 % más de lo que pagó el dueño (o de su valor si le tocó en el sorteo). El dinero va al dueño.
   (Aplica a todos los luchadores. Se puede pagar hasta que empiece el evento, solo con hueco en el equipo.)
   - **Escudo:** 2 h sin poder clausular a un luchador tras cualquier cambio de dueño (trigger `ownership_shield`, columna `shield_until`).
   - **Venganza:** si te clausulan, 30 min para recuperarlo pagando lo que pagó el otro +10 % (`pay_revenge`; ignora el escudo). Columnas `rev_user`, `rev_until`, `rev_price`.
   - **Libres del sábado:** con el mercado cerrado y antes del evento, los luchadores sin dueño se fichan a su valor, por orden de llegada (`sign_free`).
   Las cadenas de cláusulas son parte del juego (decisión del usuario).
4. **Equipo:** hay que fichar **al menos 5** (sorteo incluido; `MIN_TEAM` en `src/helpers.js`). En Equipo los huecos que faltan salen como cartas con borde rojo "Te falta fichar" y las pujas en curso como huecos dorados. Máximo **luchadores de la cartelera ÷ jugadores** (redondeando hacia arriba; p. ej. 30 luchadores y 3 jugadores → 10). Todos puntúan. Un **capitán** puntúa doble.
5. **Evento:** solo puntúan y dan dinero los luchadores de esa cartelera.
6. **Venta automática:** al terminar el evento todos los luchadores se venden solos a un precio nuevo calculado según sus puntos. Con ese dinero se ficha para el siguiente evento numerado.

- **Presupuesto por cartelera:** 200 M base (los precios siguen escalados a 100 M por mánager, así que da para más de una estrella), más lo que el jugador ganó o perdió en el evento anterior (ventas − compras + predicciones). Limitado entre 100 y 400 M. Lo no gastado no se acumula.
- **Precios normalizados por cartelera:** la suma de los precios de todos los luchadores de la cartelera = 100 M × número de jugadores. Así el presupuesto alcanza para repartirse toda la cartelera y caben estrategias distintas (una estrella y el resto baratos, o muchos medianos). Si entran jugadores nuevos, los precios se reescalan solos.
- **Precio = puntos esperados.** Antes de cada evento se calculan los puntos esperados de cada luchador simulando su pelea 20.000 veces (`scripts/pricing.js`):
  - **Ganador:** probabilidad de consenso sin margen de varias casas y de un mercado de intercambio (Kalshi; Betfair no es accesible desde aquí). En `data/event-<n>.json`: `prob` (por pelea) y `odds_source`.
  - **Método (KO / sumisión / decisión):** cuotas de método si las hay (`method_props`); si no, el récord de finalizaciones del ganador y de cuánto finalizan al perdedor.
  - **Golpes, derribos, sumisiones, control, knockdowns:** estadísticas de las últimas 10 peleas en la élite de cada luchador, lo que hace él frente a lo que suele recibir su rival (`data/stats-<n>.json`, generado con `node scripts/fighter-stats.js AAAAMMDD` desde ESPN). Con pocos minutos se acercan a la media.
  - Además cuentan el título a 5 asaltos, el bonus por ganar a alguien mejor clasificado, el multiplicador de la parte de la cartelera y los bonos de la noche. Las cuotas se usan solo por dentro: la app nunca las muestra. Precio bruto ≈ esperados^1,5 / 25 (+3 M si es campeón), después escalado a la cartelera; mínimo 1 M.
- **Venta tras el evento:** precio × (puntos obtenidos / puntos esperados), limitado entre 0,3× y 2,5×.
- **Carteleras:** se usan las carteleras oficiales de los eventos numerados en cuanto se anuncian (el 333 del 24 oct 2026 ya está cargado). Los luchadores de la cartelera que no están en el top 15 entran como "sin clasificar". En la app se muestran como "Evento 333", sin la marca.

## Puntuación (implementada en `shared/scoring.js`)

**v3 hasta el evento 333; v4 desde el siguiente** (`isV3(fight)` según `event_id`). Objetivo de v4: una finalización en la cartelera principal puntúa más que una victoria gris por decisión en una pelea por el título o que perder rápido en ella. Cambios de v4: victoria por finalización +35, decisión unánime +10, dividida/mayoritaria +5, título +10; título y "mejor clasificado" se suman después del multiplicador; título ×1,2, estelar ×1,1. La tabla siguiente es la v3.

| Acción | Puntos |
|---|---|
| Victoria por KO/TKO o sumisión | +25 |
| Victoria por decisión unánime | +15 |
| Victoria por decisión dividida o mayoritaria | +8 |
| Derrota por decisión | 0 |
| Derrota por finalización | −5 |
| Finalizar en el asalto 1 / 2 / 3+ | +15 / +10 / +5 |
| Golpe significativo | +0,5 |
| Knockdown | +10 |
| Takedown | +4 |
| Intento de sumisión | +3 |
| Minuto de control | +0,5 |
| Ganar un combate por el título | +20 |
| Ganar a un rival mejor clasificado | +10 |
| No dar el peso / punto restado | −10 / −5 |

Sin bonos por intensidad ni "ida y vuelta" (quitados en v3).

### Multiplicador y tope según la pelea

Se aplica al total de puntos del luchador en esa pelea (también a los negativos):

| Pelea | Multiplicador | Máximo |
|---|---|---|
| Por el título | ×1,5 (v4: ×1,2) | — |
| Estelar sin título | ×1,25 (v4: ×1,1) | — |
| Cartelera principal (incluye coestelar sin título) | ×1 | — |
| Preliminares | ×0,5 hasta el evento 333 → **×0,75 desde el siguiente** | 25 → **50** |
| Primeras preliminares | ×0,3 hasta el evento 333 → **×0,6 desde el siguiente** | 15 → **40** |

El cambio (v4) depende del `event_id` de la pelea en `slotMult` (`shared/scoring.js`): ≤ 333 usa v3. La tabla de reglas de la app (`multsFor` en `src/HowTo.jsx`) también.

### Bonos oficiales de la noche

Se suman enteros después del multiplicador y del tope, en cualquier pelea: pelea de la noche +25, actuación de la noche +20. Se leen solos de Wikipedia (`scripts/bonuses.js`).

El capitán multiplica por 2 su puntuación total del evento.

## Predicciones

Por cada pelea del evento el usuario puede predecir el resultado. **No dan puntos**, solo dinero para el mercado (acumulativo):

| Acierto | Dinero |
|---|---|
| Ganador | +1M |
| Método (además del ganador) | +2M extra |
| Asalto (además del método) | +3M extra |

## Navegación

1. **Inicio:** próximo evento, luchador del sorteo, lista de tareas antes del evento, clasificación.
2. **Mi equipo:** luchadores del evento, capitán, ofertas recibidas.
3. **Mercado:** libres (pujas) y de otros mánagers (ofertas y cláusulas).
4. **Eventos:** solo los próximos eventos numerados (cartelera y predicciones).
5. **Liga:** clasificación, resultados del último evento, historial, reglas y créditos de fotos.

## Más adelante

- Chat de liga, duelos cara a cara.
- Datos reales de carteleras y resultados (proveedor de datos de pago) y fotos con licencia.

## Estado

App real en construcción para el evento 333 (24 oct 2026). El prototipo antiguo está en la carpeta local del usuario (`prototipo/index.html`).

## Técnica (app real)

- **Frontend:** Vite + React (JS), PWA instalable (`public/manifest.webmanifest`). Pantallas en `src/screens/`. Estilo oscuro con esquina roja/azul y dorado (`src/styles.css`).
- **Backend:** Supabase. Esquema, seguridad (RLS) y toda la lógica del juego en `supabase/schema.sql` (funciones `sync_league`, `place_bid`, `close_market`, `pay_clause`, `set_captain`, `set_prediction`, `recalc_event`, `settle_event`, `cancel_fight`, `add_fight_to_markets`). Los clientes solo escriben mediante esas funciones.
- **Datos del evento:** `data/event-<n>.json` (cartelera y cuotas) → `node scripts/build-seed.js data/event-<n>.json` genera `supabase/seed.sql` con los puntos esperados (simulación) y el precio bruto.
- **Puntos:** `shared/scoring.js` (sistema v3: multiplicador y tope por parte de la cartelera; bonos de la noche aparte).
- **Directo:** `scripts/live.js` lee ESPN (scoreboard + estadísticas por luchador) y escribe `fighter_points` y `fights`; lo ejecuta `.github/workflows/live.yml` cada 5 min los sábados. Secretos de GitHub: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
- **Bonos:** automáticos desde Wikipedia (`event_extras`). Sanciones (no dar el peso) a mano en `event_extras`.
- **Cambios de cartelera:** automáticos en `scripts/live.js` (peleas caídas → `cancel_fight`, sustitutos → nueva pelea + `add_fight_to_markets`).
- **Precios:** `scripts/update-prices.js` (workflow "Recalcular precios") recalcula `event_fighters` y reescala las ligas.
- **Base de datos:** cambios nuevos en `supabase/migrations/NNN_*.sql`; el workflow "Aplicar cambios en la base de datos" los aplica solo al hacer push (secreto `SUPABASE_DB_URL`).
- **Cartas y récords:** `src/Card.jsx` (oro/plata/bronce), fotos grandes en `public/cards/<id>.jpg`. Récords desde Wikipedia (`scripts/records.js`); en la app se muestra "En la élite" (sin la marca).
- **Venta:** el lunes siguiente al evento a las 08:00 UTC.
- **Variables de Vercel:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
