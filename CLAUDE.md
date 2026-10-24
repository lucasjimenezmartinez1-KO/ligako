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
2. **Mercado por etapas** (antes "tandas"): horario fijo de Madrid, de 21:00 a 12:00 del día siguiente y de 12:00 a 21:00 (`stage_bounds`, migración 011; se salta un corte si la etapa dura menos de 3 h). El mercado cierra el **viernes a las 21:00**. Los luchadores se reparten entre las etapas (mezcla de oro, plata y bronce). Pujas secretas (solo se ve cuántos han pujado): gana la más alta al cerrar su etapa (mínimo, el valor). Los que nadie ficha **se reparten entre las etapas que quedan** (`spread_leftovers`). Después del cierre, solo cláusulas y libres del sábado.
   - El sorteo lo lanza el workflow "Sorteo de luchadores" cuando el usuario avisa; resta del presupuesto el 25 % del valor del luchador que toca.
3. **Fichar a un luchador de otro jugador:** solo de dos formas:
   - Oferta que el dueño acepta (solo si lo ha puesto a la venta; ver punto 7).
   - Pago de la **cláusula**: un 25 % más de lo que pagó el dueño (o de su valor si le tocó en el sorteo). El dinero va al dueño.
   (Aplica a todos los luchadores. Se puede pagar hasta que empiece el evento, solo con hueco en el equipo.)
   - **Escudo:** 2 h sin poder clausular a un luchador tras cualquier cambio de dueño (trigger `ownership_shield`, columna `shield_until`).
   - **Venganza:** si te clausulan, 30 min para recuperarlo pagando lo que pagó el otro +10 % (`pay_revenge`; ignora el escudo). Columnas `rev_user`, `rev_until`, `rev_price`.
   - **Libres del sábado:** con el mercado cerrado y antes del evento, los luchadores sin dueño se fichan a su valor, por orden de llegada (`sign_free`).
   - **Subir la cláusula:** el dueño paga los millones que quiera (con decimales) desde la ficha en Equipo, apartado «Subir cláusula» → Pagar; cada 1 M la sube 1,5 M, sin tope, solo limitado por su dinero libre; no se puede durante la venganza del anterior dueño (`raise_clause`, migraciones 010 y 018, columna `clause_extra`; se pone a 0 al cambiar de dueño). El dinero invertido se pierde; si le clausulan, cobra la cláusula entera. Cláusula = `clause_base` (25 % sobre lo pagado o el valor) + `clause_extra`.
   Las cadenas de cláusulas son parte del juego (decisión del usuario).
4. **Equipo:** hay que fichar **al menos 5** (sorteo incluido; `MIN_TEAM` en `src/helpers.js`). **Por cada uno que falte al empezar el evento, −5 puntos** (`squads.penalty` en `recalc_event`; no cuenta el hueco de una pelea cancelada, `squads.lost_cancel`; migración 016). En Equipo, pestaña «Otros equipos» con los equipos de los demás (`src/OtherTeams.jsx`; el capitán ajeno solo se ve con el evento empezado). En Equipo los huecos que faltan salen como cartas con borde rojo "Te falta fichar" y las pujas en curso como huecos dorados. Máximo **luchadores de la cartelera ÷ jugadores** (redondeando hacia arriba; p. ej. 30 luchadores y 3 jugadores → 10). Todos puntúan. Un **capitán** puntúa doble.
5. **Evento:** solo puntúan y dan dinero los luchadores de esa cartelera.
6. **Venta automática:** al terminar el evento todos los luchadores se venden solos (se ve el precio en la app), pero **ese dinero ya no pasa al siguiente evento**.
7. **Vender cualquier luchador** (como LaLiga Fantasy): desde su ficha en Equipo, «Poner a la venta» (`list_for_sale`). Los demás lo ven «En venta» en Otros equipos y pueden hacer ofertas (`make_offer`/`cancel_offer`, tabla `sale_offers`, solo las ven el dueño y quien oferta vía `my_offers`); el dueño acepta la que quiera (`accept_offer`: el luchador pasa al comprador). Además, al cerrar la etapa (12:00 o 21:00) el mercado hace su oferta (90–110 % del valor, `make_sale_offers`), válida durante la etapa siguiente; si la acepta (`release_drawn`) cobra y el luchador vuelve a salir a puja. Avisos en Inicio. Migraciones 013 y 017.

- **Presupuesto por cartelera:** **200 M para todos + lo ganado con las predicciones del evento anterior (máx. 50 M)**. Es la única ventaja económica que pasa de un evento a otro (decisión del usuario; `settle_event` guarda `carry = pred_money`, migración 012). Lo no gastado no se acumula.
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

Solo las 5 peleas de la cartelera principal; solo cuenta si aciertas el ganador. La pantalla es la normal (sin etiquetas ni importes). Los premios salen de las cuotas (probabilidad de consenso sin margen; método con cuotas de método o el modelo; asalto con el modelo): premio ≈ 1/probabilidad, limitado (`fightPrizes` en `scripts/pricing.js`, guardado en `fights.prizes` con `node scripts/pred-prizes.js data/event-<n>.json`; `pred_value`, migración 015):

| Acierto | Premio |
|---|---|
| Ganador | 1–5 M |
| Método (además del ganador) | 1–4 M |
| Asalto exacto (o +1 M si aciertas que va a decisión) | 1–3 M |

Máx. 12 M por pelea y **50 M en total**. Tras cargar una cartelera nueva hay que ejecutar `scripts/pred-prizes.js`.

## Navegación

1. **Inicio:** próximo evento, luchador del sorteo, lista de tareas antes del evento, clasificación.
2. **Mi equipo:** luchadores del evento, capitán, ofertas recibidas.
3. **Mercado:** arriba los **Movimientos** (los 4 últimos, «Ver todos»; cláusulas en naranja con rayo), luego dos pestañas: **Libres** y **De otros mánagers** (botón de cláusula naranja brillante), y al final el desplegable **Todas las cartas**.
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
- **Arranque robusto:** fuentes incluidas en la app (`@fontsource`, nada de Google Fonts), pantalla de carga en `index.html`, `ErrorBoundary` con "Recargar", Splash con "Reintentar" a los 8 s, peticiones a Supabase cortadas a los 15 s y cerrojo de sesión propio (`pageLock` en `src/supabase.js`) para que no se cuelgue al volver a la app. `vercel.json` evita que el móvil guarde una versión vieja de la página. La versión publicada se ve al final de la pestaña Liga.
- **Variables de Vercel:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
