#!/usr/bin/env node
/**
 * Copy the CesiumJS runtime files out of node_modules into `static/cesium/`,
 * so the browser can fetch them from the address we set as
 * `window.CESIUM_BASE_URL`.
 *
 * Cesium ships its code through npm, but at runtime it also fetches web
 * workers, image assets and stylesheet fonts over HTTP. Without those files
 * the globe is a blank canvas and the network tab fills with 404s.
 *
 * We load the prebuilt bundle with a <script> tag and read `window.Cesium`,
 * rather than importing the package. Cesium's source trips up bundlers, and
 * the prebuilt file is plain compiled JavaScript a browser runs as it is.
 *
 * Safe to run repeatedly, and it does nothing if Cesium is not installed yet.
 * Wired into the web app's build, so a Docker build lays the files down before
 * Vite takes its copy of `static/`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Find Cesium wherever the package manager put it. */
function findCesiumBuild() {
  try {
    // package.json is exported by cesium, so this resolves under pnpm's layout.
    const pkg = require.resolve('cesium/package.json');
    return path.join(path.dirname(pkg), 'Build', 'Cesium');
  } catch {
    return null;
  }
}

const SRC_ROOT = findCesiumBuild();
const DEST_ROOT = path.resolve(here, '..', 'static', 'cesium');
const SUBDIRS = ['Workers', 'Assets', 'Widgets', 'ThirdParty'];

if (!SRC_ROOT || !fs.existsSync(SRC_ROOT)) {
  console.log('[copy-cesium-assets] cesium is not installed yet, skipping.');
  process.exit(0);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

fs.mkdirSync(DEST_ROOT, { recursive: true });

let copied = 0;
for (const sub of SUBDIRS) {
  const from = path.join(SRC_ROOT, sub);
  const to = path.join(DEST_ROOT, sub);
  if (!fs.existsSync(from)) continue;
  // Clear the target first, so files dropped upstream do not linger here.
  fs.rmSync(to, { recursive: true, force: true });
  copyDir(from, to);
  copied += 1;
}

const bundle = path.join(SRC_ROOT, 'Cesium.js');
if (fs.existsSync(bundle)) {
  fs.copyFileSync(bundle, path.join(DEST_ROOT, 'Cesium.js'));
}

console.log(`[copy-cesium-assets] copied ${copied}/${SUBDIRS.length} folders into ${DEST_ROOT}`);
