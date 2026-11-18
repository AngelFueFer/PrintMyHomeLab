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
