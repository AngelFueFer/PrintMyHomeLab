# PrintMyHomeLab

Configurador de rack para home lab.
Web para diseñar un mini-rack de 10″ o 19″ impreso en 3D:

- **Raíles de esquina** metálicos (con enlaces de compra) o impresos en L, partidos en tramos que caben en tu cama.
- **Tapas independientes** en frontal, trasera, laterales y arriba. Cada una con un diseño propio: plantillas (lisa, ranuras, panal, rejilla, ventilador, ventana, patch panel) o un editor 2D donde colocas ventiladores, agujeros, ranuras, panales y keystones. También puedes importar tus propios diseños en **DXF o SVG**, o descargar la plantilla CAD de cada tapa con sus medidas para dibujarla en tu programa de CAD. Las tapas se agrupan por lado y se pueden unir o partir.
- **Baldas** en la U que quieras: bandeja genérica, mini PC, router, discos o placa base vertical con fuente SFX.

Lo ves en 3D, pones ventiladores con un clic sobre cualquier tapa y descargas un ZIP con todos los STL ya orientados y partidos para tu impresora.

**Web:** https://angelfuefer.github.io/PrintMyHomeLab/

## Cómo funciona
- Todo corre en el navegador, sin servidor. La geometría se calcula con [Manifold](https://github.com/elalish/manifold) (WebAssembly) y se muestra con [three.js](https://threejs.org/). Si Manifold no carga, usa [JSCAD](https://github.com/jscad/OpenJSCAD.org) como respaldo.
- Las piezas más grandes que la cama de la impresora se parten solas con colas de milano.
- La configuración se guarda en el navegador y va dentro del ZIP (`configuracion.json`).

## Raíles de esquina

### Metálicos (recomendado)
4 raíles en L de la altura del rack: **14U = 622,3 mm** (1U = 44,45 mm). Ala frontal de 15,8 mm y ala lateral de 20 mm, con agujero cuadrado para tuerca enjaulada M6. Si los compras más largos, córtalos a la medida.

Dónde comprarlos:
- [Penn Elcom R0883-2mm-14](https://penn-elcom.com/mx/14u-full-hole-double-rack-rail-with-square-holes-2mm-thick-r0883-2mm-14): raíl doble de 14U, agujero cuadrado, 2 mm de grosor.
- [Hammond CLSR](https://www.hammfg.com/product/clsr): raíl de montaje con agujero cuadrado, en varias alturas.
- [DeskPi RackMate T1 / T2](https://deskpi.com/products/deskpi-rackmate-t1-2): rack metálico de 10″ completo, si prefieres no imprimir la estructura.

Además: tuercas enjauladas M6 con tornillos M6×12 (4 por tapa frontal o trasera). Para los laterales, taladra el ala lateral del raíl a 4,5 mm y usa M4×10 con tuerca. La web calcula las cantidades en «Tornillería y material aparte».

### Impresos
La web genera los raíles en L de 5 mm, partidos en tramos que caben en tu cama y unidos con espigas de acero de 3 mm. Llevan insertos roscados M5 (Ø6,4) para las tapas y M4 (Ø5,6) para los laterales. Imprímelos en PETG o ASA con 5 perímetros. Para un rack cargado, mejor metálicos.

## Código
| Archivo | Qué hace |
|---|---|
| `src/geo.js` | Medidas, raíles, tapas (plantillas y formas 2D), baldas y piezas del rack |
| `src/kernel.js` | Adaptadores CSG (Manifold / JSCAD), mallas y exportación STL |
| `src/pipeline.js` | Generación de cada pieza y corte según la cama |
| `src/app.js` | Interfaz, visor 3D, editor 2D de tapas, ventiladores y descargas |
| `src/template.html` | Estilos y maquetación |

`index.html` es la web ya compilada (incluye el WASM de Manifold). Para regenerarla tras cambiar `src/`:

```bash
npm install
npm run build
```

## Aviso
Las medidas de los equipos (router, mini PC, agujeros de la placa base) son aproximadas. Mídelos antes de imprimir.
