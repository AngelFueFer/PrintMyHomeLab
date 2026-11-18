// Genera index.html (web autónoma) a partir de src/. Uso: npm install && npm run build
import fs from 'fs';
const strip = (f) => fs.readFileSync(f, 'utf8').replace(/^import .*$/mg, '').replace(/^export /mg, '');
const app = fs.readFileSync('src/app.js', 'utf8');
const imports = app.match(/^import .*$/mg).join('\n');
const body = [imports, strip('src/geo.js'), strip('src/kernel.js'), strip('src/pipeline.js'), app.replace(/^import .*$/mg, '')].join('\n');
const wasm = fs.readFileSync('node_modules/manifold-3d/manifold.wasm').toString('base64');
const page = fs.readFileSync('src/template.html', 'utf8').replace('%%WASM%%', () => wasm).replace('%%APP%%', () => body);
const html = `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n${page}\n</body>\n</html>\n`;
fs.writeFileSync(process.argv[2] || 'index.html', html);
console.log('index.html', html.length, 'bytes');
