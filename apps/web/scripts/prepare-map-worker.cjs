// MapLibre's ESM worker URL cannot be inferred from Next's bundled chunk URL.
// Serve the pinned package's worker and its shared module from our own origin.
const fs = require('node:fs');
const path = require('node:path');
const packageRoot = path.dirname(require.resolve('maplibre-gl/package.json'));
const destination = path.join(__dirname, '../public/maplibre');
fs.mkdirSync(destination, { recursive: true });
for (const name of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  fs.copyFileSync(path.join(packageRoot, 'dist', name), path.join(destination, name));
}
fs.copyFileSync(path.join(packageRoot, 'LICENSE.txt'), path.join(destination, 'LICENSE.txt'));
