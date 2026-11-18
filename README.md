# PrintMyHomeLab

Configurador de rack para home lab.
Web para diseñar un mini-rack de 10″ o 19″ impreso en 3D con raíles metálicos: eliges fondo, módulos (almacenamiento, placa base vertical + SFX, mini PC, router, bandejas, patch panel, tapas), pones ventiladores con un clic, lo ves en 3D y descargas un ZIP con todos los STL ya orientados y partidos para tu impresora.

**Web:** https://angelfuefer.github.io/PrintMyHomeLab/

## Cómo funciona
- Todo corre en el navegador, sin servidor. La geometría se calcula con [Manifold](https://github.com/elalish/manifold) (WebAssembly) y se muestra con [three.js](https://threejs.org/). Si Manifold no carga, usa [JSCAD](https://github.com/jscad/OpenJSCAD.org) como respaldo.
- Las piezas más grandes que la cama de la impresora se parten solas con colas de milano.
- La configuración se guarda en el navegador y va dentro del ZIP (`configuracion.json`).

## Código
| Archivo | Qué hace |
|---|---|
| `src/geo.js` | Medidas, módulos y piezas del rack (port de `scad/rack10_homelab.scad`) |
| `src/kernel.js` | Adaptadores CSG (Manifold / JSCAD), mallas y exportación STL |
| `src/pipeline.js` | Generación de cada pieza y corte según la cama |
| `src/app.js` | Interfaz, visor 3D, ventiladores y descargas |
| `src/template.html` | Estilos y maquetación |

`index.html` es la web ya compilada (incluye el WASM de Manifold). Para regenerarla tras cambiar `src/`:

```bash
npm install
npm run build
```

## Aviso
Las medidas de los equipos (router, mini PC, agujeros de la placa base) son aproximadas. Mídelos antes de imprimir.
