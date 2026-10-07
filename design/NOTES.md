# Canario de Claude Code

Cuatro dibujos originales a su resolución final. **Small y tiny están dibujados a mano para su cuadrícula; no son reducciones de normal o large.**

| Tamaño | Píxeles | Terminal (columnas × filas) |
| --- | --- | --- |
| `tiny` | 10 × 6 | 10 × 3 |
| `small` | 14 × 8 | 14 × 4 |
| `normal` | 20 × 12 | 20 × 6 |
| `large` | 24 × 16 | 24 × 8 |

Cada fila de terminal representa dos píxeles verticales: todas las alturas en píxeles son pares. Se mantienen íntegros los cinco frames de normal y large, sus 30 PNG y la paleta original. Se conservan también `draw2.py`, `alive2.png` y `dead3.png`.

## Diseño

- Perfil derecho, amarillo cálido, coronilla redondeada, pico naranja de un píxel en reposo y cola ocre larga que termina en punta. El ojo combina una pupila oscura con un píxel marfil de brillo.
- El pecho claro y el ala ocre forman masas continuas: no hay ruido, tramado ni suavizado. La luz viene de arriba a la izquierda. Los ocres delimitan la silueta contra fondos claros; el amarillo y el pecho la separan de fondos oscuros.
- En **large** hay dos patas de un píxel de ancho y dedos sobre la percha. En **normal**, dos apoyos naranjas sobre la madera dejan seis filas para cabeza y cuerpo: coronilla, ojo con brillo, pico separado, pecho claro más alto, ala ocre y cola en punta. Los cuatro estados vivos de large se conservan píxel a píxel.
- Jaula gris de tres tonos, aro con hueco, cúpula escalonada y bandeja. Large conserva sus tres barrotes interiores; normal usa dos y despeja el interior de la cúpula para dejar respirar la cabeza. Todos quedan detrás del pájaro. Los estados vivos comparten una capa fija por tamaño; el salto descubre esa misma capa.
- En normal, la bandeja se resume en un borde lateral y una fila inferior; en large, tiene labio y zócalo separados.
- `idle`: reposo. `blink`: línea oscura de dos píxeles, sin brillo. `chirp`: dos mitades naranjas separadas por la boca oscura. `hop`: cabeza, cuerpo y cola un píxel más arriba; apoyos recogidos. En large los dedos suben un píxel adicional, y en normal los apoyos se acercan.
- `dead`: tumbado de espaldas sobre la bandeja, vientre claro arriba, ala gris abajo y cola afinada a la izquierda. La cabeza se distingue del cuerpo, con X oscura de **3 × 3** sobre gris claro y pico naranja apagado. Dos patas rectas de **1 × 2 píxeles**, también naranja apagado (`o`), sobresalen hacia arriba. Se deja un píxel libre entre pico/cola y los laterales.
- Solo en `dead`, la percha se coloca arriba y queda entera y vacía: fila **4** en normal y **6** en large (coordenadas desde cero), con una fila libre antes de las patas. Es una composición estática aparte; conserva el resto de la jaula. La percha de los estados vivos sigue en las filas 9 y 12, respectivamente.
- No se añade nota musical: mantiene el dibujo dentro de la jaula y concentra la animación en el pico. No hay audio.

### Nuevos tamaños compactos

- **Small (14 × 8):** cúpula escalonada, dos barrotes interiores, laterales y base fija. Cabeza amarilla con brillo y ojo oscuro, pico naranja, pecho claro, ala y cola ocres. Dos apoyos separados; el salto sube un píxel y deja aire sobre la base. Se omiten el aro y la percha para dedicar la altura al pájaro.
- **Tiny (10 × 6):** jaula reducida a cúpula, dos barrotes laterales y base. La cabeza conserva ojo con brillo y pico; cuerpo y cola se resumen en cuatro píxeles. La cola deja un píxel de aire antes del lateral. Al saltar, la coronilla se integra en la cara para subir sin invadir la cúpula.
- En ambos, `blink` cambia el brillo y la pupila por dos píxeles oscuros; `chirp` abre el pico en dos mitades naranjas con un centro oscuro. Las cinco poses son distintas.
- **Dead compacto:** cuerpo horizontal gris junto a la base, vientre claro, ojo cerrado oscuro de un píxel y pico apagado. Dos patas apuntan hacia arriba: de dos píxeles de alto en small y de uno en tiny. La postura y el gris sustituyen la X grande, que no cabe en estas cuadrículas.
- **La jaula compacta es idéntica píxel a píxel en los cinco frames, incluido dead.** Ningún píxel del pájaro tapa su estructura; tampoco se mueve una percha entre poses. La composición histórica de normal y large descrita arriba permanece intacta.

## Paleta

| Uso | Caracteres y colores |
| --- | --- |
| Jaula: luz, estructura, barrotes y base | `H` #b6c0c6 · `G` #87939e · `g` #576571 |
| Madera: percha y extremos | `B` #a77849 · `b` #714c32 |
| Plumas: amarillo, pecho y transición | `Y` #f7cc32 · `y` #ffe99a · `U` #dfa927 |
| Ala, cola y contorno cálido | `W` #bd8826 · `S` #895e24 |
| Pico y patas; `o` apagado en dead | `O` #ed8c36 · `o` #a85e30 |
| Ojo y brillo | `K` #252b35 · `w` #fff9dc |
| Muerto: cuerpo, luz, sombra y contorno | `D` #b7bbb8 · `E` #d5d7cf · `d` #828b8e · `s` #59636c |
| Muerto: X y tono reservado de la paleta original | `x` #303742 · `t` #979184 |

`.` es transparencia, no un color de la paleta. Los fondos de comprobación son **#171b23** (oscuro) y **#f5f1e8** (claro); no se incorporan al sprite.

## Archivos y uso

- `sprites.json`: fuente de datos para integrar en el mod, con `palette` y `sizes`, dimensiones y cinco arrays de filas por tamaño.
- `render.py`: lee ese JSON y genera los PNG usando Python 3 y Pillow. Ejecutar `python3 render.py` desde esta carpeta. Opcional: `python3 render.py --scale 16`.
- `<size>-<frame>.png`: ampliación 24× con canal alfa y transparencia real. Las variantes `-dark.png` y `-light.png` permiten revisar contraste sin depender del visor: **60 archivos individuales** (20 transparentes y 40 con fondo). La ampliación usa vecino más próximo solo para visualizar; el dibujo fuente conserva sus píxeles nativos.
- `contact-sheet.png`: los veinte estados sobre ambos fondos, al mismo factor entero de ampliación para comparar las cuatro resoluciones. Cada panel reúne cinco columnas de poses y cuatro filas de tamaños.
- `preview.html`: abrir directamente en el navegador, incluso sin conexión. JSON, estilos y JavaScript embebidos; sin CDN, servidor ni peticiones de red. `render.py` actualiza automáticamente el JSON embebido tras modificar el atlas.
- `make_sprites.py`: fuente de autoría adicional, con capas de jaula y pájaro dibujadas a mano. Para retocar capas y regenerar todo: `python3 make_sprites.py` y después `python3 render.py`. Si se edita directamente `sprites.json`, basta con ejecutar el segundo comando.

La animación dura **13,99 segundos** y permanece en reposo aproximadamente el **93,4 %** del ciclo. Incluye parpadeo, doble pío, salto y un doble parpadeo breve. Se puede pausar, fijar cualquiera de las cinco poses, cambiar el fondo y ajustar la escala **de 1× a 8×**. Small y tiny aparecen primero. Respeta la preferencia de movimiento reducido, detiene el reloj al ocultar la pestaña y mantiene el muerto al lado. En móvil, las tarjetas se apilan y los dos tipos de render conservan una escala entera que cabe en el espacio disponible.

## Medios bloques

La segunda vista utiliza caracteres reales `▀`, no otra copia del canvas. Cada celda mide un píxel de ancho por dos de alto. Su color de texto representa `frame[2*y][x]` y su fondo representa `frame[2*y+1][x]`. Se normaliza el avance horizontal de la fuente monoespaciada a la anchura de la celda. La forma exacta del glifo puede variar entre fuentes y terminales.

En la demo, una mitad transparente toma el fondo seleccionado. En una terminal se debe usar el color de fondo por defecto también como primer plano cuando la mitad superior es transparente; si ambas mitades son transparentes, sirve un espacio con fondo por defecto. Hay que repintar todas las celdas del rectángulo al cambiar de estado para que no queden restos del salto o del pico abierto. El atlas no contiene códigos ANSI ni asume un fondo fijo.

## Revisión

Ampliación del 7 de octubre de 2026: se añaden small y tiny sin cambiar ningún frame de normal o large. La referencia inmediatamente anterior está en `.qa/before-compact.json`; las huellas de los 30 PNG existentes están en `.qa/before-compact-pngs.json`. La revisión anterior de normal y large se conserva en `.qa/before-retouch.json`.

Se inspeccionaron los diez frames nuevos a **1× nativo**, ampliados sin suavizado y con caracteres reales `▀` de **12 px** (celdas de **6 × 12 px**), en fondos claro y oscuro y sin ampliar la captura. Small ocupa **84 × 48 px / 4 filas** y tiny **60 × 36 px / 3 filas** en esta simulación de terminal. Tras la primera revisión se acortó la cola de tiny y se separó también su silueta muerta del barrote. Las vistas de las cinco poses están en `.qa/compact-real-scale-dark.png` y `.qa/compact-real-scale-light.png`.

Comprobaciones superadas: 20 frames con dimensiones y caracteres válidos; cinco poses diferentes por tamaño compacto; jaula compacta exacta en todos los frames; dead gris y dos patas por encima del cuerpo. Los **60 PNG** coinciden con el atlas, conservan la transparencia donde corresponde, y los 30 PNG de normal y large mantienen sus huellas originales. El JSON embebido coincide exactamente con `sprites.json`.

En Chrome se verificaron los cuatro tamaños, cinco estados y ambos fondos, **7.960 correspondencias píxel/medio bloque**, resolución nativa 1×, ausencia de solicitudes de red y errores JavaScript, pausa y movimiento reducido. Sin desbordamientos ni recortes a 320, 375, 768 y 1200 píxeles de ancho. Para repetir: `python3 -B .qa/check-atlas.py` y `TMPDIR="$PWD/.qa/browser-tmp" node .qa/check-preview.cjs` desde esta carpeta (Pillow y Playwright/Chrome ya disponibles).

Todo el trabajo y los archivos generados permanecen en `~/mods/.design`. No se ha publicado nada.
