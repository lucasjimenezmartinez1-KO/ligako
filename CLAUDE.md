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

## Ciclo de cada evento (numerados y veladas sin número)

1. **Listos y sorteo:** en **cada evento** el mercado solo empieza cuando **todos** los mánagers pulsan «Estoy listo» (al abrirse un evento nuevo todos vuelven a "no listo"). Si no están todos antes del cierre, en esa liga no se juega ese evento: sin fichajes ni penalización (migración 030; ya no empieza solo 12 h antes del cierre). Al cerrarlo no se toca lo que pasa al siguiente evento (migración 031). Para cerrar ya un evento terminado: `scripts/settle-now.js <id>`. Al empezar se asigna al azar **un luchador de las preliminares a cada jugador**, gratis (el presupuesto baja un 25 % de su valor).
2. **Mercado por etapas** (antes "tandas"): horario fijo de Madrid, de 21:00 a 12:00 del día siguiente y de 12:00 a 21:00 (`stage_bounds`, migración 011; se salta un corte si la etapa dura menos de 3 h). El mercado cierra el **viernes a las 21:00**. Los luchadores se reparten entre las etapas (mezcla de oro, plata y bronce). Pujas secretas (solo se ve cuántos han pujado): gana la más alta al cerrar su etapa (mínimo, el valor). Los que nadie ficha **se reparten entre las etapas que quedan** (`spread_leftovers`). Después del cierre, solo cláusulas y libres del sábado.
   - El sorteo lo lanza el workflow "Sorteo de luchadores" cuando el usuario avisa; resta del presupuesto el 25 % del valor del luchador que toca.
3. **Fichar a un luchador de otro jugador:** solo de dos formas:
   - **Oferta privada** que el dueño acepta, por cualquier luchador (esté o no a la venta): botón «Oferta» en Mercado → De otros mánagers o en su ficha (`OfferSheet` en `src/OtherTeams.jsx`). No sale en Movimientos; al dueño le llega a Inicio (Aceptar/Rechazar, `ManagerOffer` en `src/Ready.jsx`) y un aviso al móvil. `make_offer`, `reject_offer`, `accept_offer` (migración 026).
   - Pago de la **cláusula**: un 25 % más de lo que pagó el dueño (o de su valor si le tocó en el sorteo). El dinero va al dueño.
   (Aplica a todos los luchadores. Se puede pagar hasta que empiece el evento, solo con hueco en el equipo.)
   - **Escudo:** 2 h sin poder clausular a un luchador tras cualquier cambio de dueño salvo una venganza (trigger `ownership_shield`, columna `shield_until`; migración 019). Con escudo, en Mercado se ve igualmente el precio de la cláusula con el tiempo que falta.
   - **Venganza:** si te clausulan, 30 min para recuperarlo pagando lo que pagó el otro +10 % (`pay_revenge`; ignora el escudo y no pone escudo nuevo). Columnas `rev_user`, `rev_until`, `rev_price`.
   - **Día del evento** (columnas de `events`, migración 025): `no_shield_from` (desde ahí no cuentan los escudos; la venganza sigue), `clauses_until` (cierre de cláusulas) y `free_from` (mini mercado: solo libres a su valor). Evento 333: 12–15 clausulazos sin escudo, 15–16 mini mercado, 16:00 empieza (primeras preliminares; preliminares 18:00, principal 20:00). En Mercado se ve el horario del día.
   - **Libres del sábado:** con el mercado cerrado y antes del evento, los luchadores sin dueño se fichan a su valor, por orden de llegada (`sign_free`).
   - **Subir la cláusula:** el dueño paga los millones que quiera (con decimales) desde la ficha en Equipo, apartado «Subir cláusula» → Pagar; cada 1 M la sube 1,5 M, sin tope, solo limitado por su dinero libre; no se puede durante la venganza del anterior dueño (`raise_clause`, migraciones 010 y 018, columna `clause_extra`; se pone a 0 al cambiar de dueño). El dinero invertido se pierde; si le clausulan, cobra la cláusula entera. Cláusula = `clause_base` (25 % sobre lo pagado o el valor) + `clause_extra`.
   - **No se puede bajar la cláusula** (se probó y se quitó: migraciones 020 y 021).
   Las cadenas de cláusulas son parte del juego (decisión del usuario).
4. **Equipo:** hay que fichar **al menos 5** (sorteo incluido; `MIN_TEAM` en `src/helpers.js`). **Por cada uno que falte al empezar el evento, −5 puntos** (`squads.penalty` en `recalc_event`; no cuenta el hueco de una pelea cancelada, `squads.lost_cancel`; migración 016). En Equipo, pestaña «Otros equipos» con los equipos de los demás (`src/OtherTeams.jsx`; el capitán ajeno solo se ve con el evento empezado). En Equipo los huecos que faltan salen como cartas con borde rojo "Te falta fichar" y las pujas en curso como huecos dorados. Máximo **luchadores de la cartelera ÷ jugadores** (redondeando hacia arriba; p. ej. 30 luchadores y 3 jugadores → 10). Todos puntúan. Un **capitán** puntúa doble. Con el evento empezado se puede cambiar de capitán solo si ni el actual ni el nuevo han peleado aún (`set_captain`, migración 028).
5. **Evento:** solo puntúan y dan dinero los luchadores de esa cartelera.
6. **Venta automática:** al terminar el evento todos los luchadores se venden solos (se ve el precio en la app), pero **ese dinero ya no pasa al siguiente evento**.
7. **Vender cualquier luchador** (como LaLiga Fantasy): desde su ficha en Equipo, «Poner a la venta» (`list_for_sale`). Los demás lo ven «En venta» en Otros equipos y pueden hacer ofertas (`make_offer`/`cancel_offer`, tabla `sale_offers`, solo las ven el dueño y quien oferta vía `my_offers`); el dueño acepta la que quiera (`accept_offer`: el luchador pasa al comprador). Además, al cerrar la etapa (12:00 o 21:00) el mercado hace su oferta (90–110 % del valor, `make_sale_offers`), válida durante la etapa siguiente; si la acepta (`release_drawn`) cobra y el luchador vuelve a salir a puja. Avisos en Inicio. Migraciones 013 y 017.

- **Presupuesto por cartelera:** **base del evento (`events.budget`: 200 M en los numerados, 100 M en las veladas sin número) + lo ganado con las predicciones del evento anterior (máx. 50 M)** (migración 029). Es la única ventaja económica que pasa de un evento a otro (decisión del usuario; `settle_event` guarda `carry = pred_money`, migración 012). Lo no gastado no se acumula.
- **Precios normalizados por cartelera:** la suma de los precios de todos los luchadores de la cartelera = 100 M × número de jugadores. Así el presupuesto alcanza para repartirse toda la cartelera y caben estrategias distintas (una estrella y el resto baratos, o muchos medianos). Si entran jugadores nuevos, los precios se reescalan solos.
- **Precio = puntos esperados.** Antes de cada evento se calculan los puntos esperados de cada luchador simulando su pelea 20.000 veces (`scripts/pricing.js`):
  - **Ganador:** probabilidad de consenso sin margen de varias casas y de un mercado de intercambio (Kalshi; Betfair no es accesible desde aquí). En `data/event-<n>.json`: `prob` (por pelea) y `odds_source`.
  - **Método (KO / sumisión / decisión):** cuotas de método si las hay (`method_props`); si no, el récord de finalizaciones del ganador y de cuánto finalizan al perdedor.
  - **Golpes, derribos, sumisiones, control, knockdowns:** estadísticas de las últimas 10 peleas en la élite de cada luchador, lo que hace él frente a lo que suele recibir su rival (`data/stats-<n>.json`, generado con `node scripts/fighter-stats.js AAAAMMDD` desde ESPN). Con pocos minutos se acercan a la media.
  - Además cuentan el título a 5 asaltos, el bonus por ganar a alguien mejor clasificado, el multiplicador de la parte de la cartelera y los bonos de la noche. Las cuotas se usan solo por dentro: la app nunca las muestra. Precio bruto ≈ esperados^1,5 / 25 (+3 M si es campeón), después escalado a la cartelera; mínimo 1 M.
- **Venta tras el evento:** precio × (puntos obtenidos / puntos esperados), limitado entre 0,3× y 2,5×.
- **Carteleras:** numerados y veladas sin número (desde la del 31 oct 2026, Moicano vs. Nolan, id 20261031). Se cargan **solas** desde ESPN con `scripts/next-event.js` (`loadNextEvent`): luchadores (los nuevos, sin clasificar), peleas y partes de la cartelera (por hora de ESPN), probabilidades (`data/odds-<id>.json` si existe —cuotas, peleas caídas y `titles`—, si no **Kalshi** —API pública, serie `KXUFCFIGHT`, abre ~6 días antes—, si no ESPN, si no 50 % con `fights.pa` vacío; mientras ningún mercado haya empezado, `live.js` lo reintenta y refresca precios), títulos (ESPN o frases con "Championship" en Wikipedia), estadísticas (`scripts/espn-stats.js`), precio, premios de predicciones y horario (mercado hasta las 21:00 del día anterior; el día del evento, cláusulas sin escudo desde las 12:00 y mini mercado la última hora). Id: el número del evento o AAAAMMDD en las veladas. En la app: "Evento 333" o "Velada del 31 oct" (`evName` en `src/format.js`, `ev_label` en SQL), sin la marca.

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
| No dar el peso / punto restado por el árbitro | −10 / −5 por punto (enteros, sin multiplicar; los puntos restados se leen solos de Wikipedia, `parseDeductions` en `scripts/bonuses.js`) |
| Descalificado / ganar por descalificación | −20 (entero) / +8 (`DQ` en `mapMethod`) |

Sin bonos por intensidad ni "ida y vuelta" (quitados en v3).

### Multiplicador y tope según la pelea

Se aplica al total de puntos del luchador en esa pelea (también a los negativos):

| Pelea | Multiplicador | Máximo |
|---|---|---|
| Por el título | ×1,5 (v4: ×1,2) | — |
| Estelar sin título | ×1,25 (v4: ×1,1) | — |
| Cartelera principal (incluye coestelar sin título) | ×1 | — |
| Preliminares | ×0,75 en el evento 333 (cambiado el mismo día; antes ×0,5) → **×0,75 desde el siguiente** | 60 (subido el día del evento 333) |
| Primeras preliminares | ×0,5 en el evento 333 (antes ×0,3) → **×0,6 desde el siguiente** | 40 |

El cambio (v4) depende del `event_id` de la pelea en `slotMult` (`shared/scoring.js`): ≤ 333 usa v3. La tabla de reglas de la app (`multsFor` en `src/HowTo.jsx`) también.

### Bonos oficiales de la noche

Se suman enteros después del multiplicador y del tope, en cualquier pelea: **pelea de la noche +35** (a los dos), **actuación de la noche +40** (subidos el día del evento 333; antes +25 y +20). Se leen solos de Wikipedia (`scripts/bonuses.js`) cuando están publicados los dos, al terminar la cartelera.

### Ganar sin ser favorito

Desde el evento 333 (puesto el mismo día): si gana con menos de un 45 % de probabilidad previa, +5 a +15 (+15 con un 20 % o menos), entero, después del multiplicador y del tope (`underdogBonus` en `shared/scoring.js`; `scripts/live.js` lee la probabilidad de `data/event-<n>.json`). La app no muestra la probabilidad.

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

## Avisos en el móvil

Notificaciones push cuando te hacen un clausulazo, te recuperan un luchador con la venganza o te hacen una oferta privada. Al abrir la app salta un aviso para activarlos (`PushPrompt`, una vez por apertura mientras no estén activados) y hay tarjeta en Inicio (`src/PushToggle.jsx`, service worker `public/sw.js` sin caché). En iPhone solo con la app instalada. Trigger `moves_push` → `send_push` → `pg_net` → `api/push.js` (Vercel, `web-push`). Tablas `push_subs` y `push_config` (claves VAPID, las crea solo el workflow de migraciones; nunca en el repo). Migración 022.

## Navegación

1. **Inicio:** próximo evento, luchador del sorteo, lista de tareas antes del evento, clasificación. Con el evento empezado desaparecen cláusulas, ofertas y avisos, y sale **Tus luchadores** (`src/LiveTeam.jsx`): puntos de cada uno (capitán ×2), si está peleando, resultado o la hora aproximada de su pelea (~25 min por pelea desde la última de la cartelera, sin adelantar el inicio de cada parte).
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
- **Fotos:** workflow "Fotos de luchadores" (solo a mano) con `scripts/photos.js`: busca la imagen del artículo de Wikipedia (solo si el artículo es de un luchador) o en Commons (nombre completo en el archivo), solo CC BY / CC BY-SA / CC0 / dominio público; genera avatar, carta y foto grande de la estelar (`public/hero`). Para poner un archivo concreto: entrada `force` del workflow (`id|File:Nombre.jpg|x,y,w,h` con recorte opcional en fracciones; `hero` para la portada). **Siempre revisar a mano** después: salieron homónimos (un actor, un pueblo…) y fotos con logos de la promotora, que hay que tapar (gorra de Moicano, camiseta de Luana Santos). Sin foto con licencia → iniciales.
- **Cartas y récords:** `src/Card.jsx` (oro/plata/bronce), fotos grandes en `public/cards/<id>.jpg`. Récords desde Wikipedia (`scripts/records.js`); en la app se muestra "En la élite" (sin la marca).
- **Cambio de evento automático:** `scripts/live.js` cierra el evento (`settle_event`: venta automática, predicciones → `carry`) **24 h después de la última pelea**, carga la siguiente cartelera y lanza el workflow de fotos; entre eventos, cada 3 h, intenta cargarla. El equipo de cada evento es nuevo (la propiedad va por evento). Las lecturas programadas de los sábados siguen leyendo cada minuto mientras dura el evento (hasta 340 min por lectura).
- **Arranque robusto:** fuentes incluidas en la app (`@fontsource`, nada de Google Fonts), pantalla de carga en `index.html`, `ErrorBoundary` con "Recargar", Splash con "Reintentar" a los 8 s, peticiones a Supabase cortadas a los 15 s y cerrojo de sesión propio (`pageLock` en `src/supabase.js`) para que no se cuelgue al volver a la app. `vercel.json` evita que el móvil guarde una versión vieja de la página. La versión publicada se ve al final de la pestaña Liga.
- **Variables de Vercel:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
