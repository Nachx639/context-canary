# Canario de Claude Code

Dos dibujos originales a su resolución final: **normal, 20 × 12 píxeles (20 × 6 celdas)**; **large, 24 × 16 píxeles (24 × 8 celdas)**. El pequeño no se obtiene reduciendo el grande. Se conservan los archivos de partida `draw2.py`, `alive2.png` y `dead3.png`.

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
- `<size>-<frame>.png`: ampliación 24× con canal alfa y transparencia real. Las variantes `-dark.png` y `-light.png` permiten revisar contraste sin depender del visor: 30 archivos individuales en total.
- `contact-sheet.png`: los diez estados sobre ambos fondos, al mismo factor entero de ampliación para comparar las dos resoluciones. Cada panel reúne cinco columnas de poses y dos filas de tamaños.
- `preview.html`: abrir directamente en el navegador, incluso sin conexión. JSON, estilos y JavaScript embebidos; sin CDN, servidor ni peticiones de red. `render.py` actualiza automáticamente el JSON embebido tras modificar el atlas.
- `make_sprites.py`: fuente de autoría adicional, con capas de jaula y pájaro dibujadas a mano. Para retocar capas y regenerar todo: `python3 make_sprites.py` y después `python3 render.py`. Si se edita directamente `sprites.json`, basta con ejecutar el segundo comando.

La animación dura **13,99 segundos** y permanece en reposo aproximadamente el **93,4 %** del ciclo. Incluye parpadeo, doble pío, salto y un doble parpadeo breve. Se puede pausar, fijar cualquiera de las cinco poses, cambiar el fondo y ajustar la escala. Respeta la preferencia de movimiento reducido, detiene el reloj al ocultar la pestaña y mantiene el muerto al lado. En móvil, las tarjetas se apilan y los dos tipos de render conservan una escala entera que cabe en el espacio disponible.

## Medios bloques

La segunda vista utiliza caracteres reales `▀`, no otra copia del canvas. Cada celda mide un píxel de ancho por dos de alto. Su color de texto representa `frame[2*y][x]` y su fondo representa `frame[2*y+1][x]`. Se normaliza el avance horizontal de la fuente monoespaciada a la anchura de la celda. La forma exacta del glifo puede variar entre fuentes y terminales.

En la demo, una mitad transparente toma el fondo seleccionado. En una terminal se debe usar el color de fondo por defecto también como primer plano cuando la mitad superior es transparente; si ambas mitades son transparentes, sirve un espacio con fondo por defecto. Hay que repintar todas las celdas del rectángulo al cambiar de estado para que no queden restos del salto o del pico abierto. El atlas no contiene códigos ANSI ni asume un fondo fijo.

## Revisión

Retoque del 7 de octubre de 2026: normal pasa de 20 × 10 a **20 × 12**, redibujado a mano; ambos dead sustituyen el bulto gris por un pájaro de espaldas con patas y ojo inequívocos. La paleta completa y los cuatro frames vivos de large se mantienen exactamente iguales, incluidos sus doce PNG transparentes y con fondo.

Se inspeccionaron la hoja de contacto ampliada y las capturas del navegador sobre ambos fondos, incluyendo caracteres reales `▀` de **12 px**, con celdas de **6 × 12 px**: normal ocupa **20 columnas × 6 filas**, sin ampliar la captura. Tras la primera revisión se ensanchó el pecho normal, se aclaró la cabeza muerta alrededor de la X y se separaron pico y cola de los laterales. Las capturas y la referencia anterior al retoque están en `.qa/`; no forman parte del atlas.

Comprobaciones superadas: cinco poses por tamaño, dimensiones, paleta original, transparencia, patas rectas y X en ambos dead, percha vacía y conservación exacta de large vivo. Los 30 PNG coinciden con el atlas regenerado, y el JSON embebido coincide exactamente con `sprites.json`. En Chrome se verificaron los cinco estados y ambos fondos, **6.240 correspondencias píxel/medio bloque**, ausencia de solicitudes de red y errores JavaScript, pausa y movimiento reducido. Sin desbordamientos ni recortes a 320, 375, 768 y 1200 píxeles de ancho.

Todo el trabajo y los archivos generados permanecen en `~/mods/.design`. No se ha publicado nada.
