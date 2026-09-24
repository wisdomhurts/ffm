// Builds the game into self-contained HTML files (no network needed at runtime).
//   dist/index.html     full document, cartoon faces (safe to share publicly)
//   dist/family.html    full document with the family photos from private/faces (NOT committed)
//   dist/artifact.html  body-only page with photos, for publishing as a private claude.ai artifact
// Usage: node build.mjs [--dev] [--watch]
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const args = new Set(argv);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const dev = args.has('--dev');
const root = path.dirname(new URL(import.meta.url).pathname);
// --out <dir> lets parallel workers build without clobbering each other; --entry builds a dev page (e.g. a model gallery)
const dist = path.resolve(root, opt('--out', 'dist'));
const entry = path.resolve(root, opt('--entry', 'src/main.js'));
fs.mkdirSync(dist, { recursive: true });

const TITLE = 'Steal A Seed! Family Edition';
const IDS = ['dorian', 'esther', 'maddie', 'micah'];

function faceScript() {
  const dir = path.join(root, 'private', 'faces');
  if (!fs.existsSync(dir)) return null;
  let skin = {};
  try {
    skin = JSON.parse(fs.readFileSync(path.join(dir, 'skin.json'), 'utf8'));
  } catch {
    /* optional */
  }
  const faces = {};
  for (const id of IDS) {
    const f = path.join(dir, `${id}_face.jpg`);
    const a = path.join(dir, `${id}_avatar.jpg`);
    if (!fs.existsSync(f)) continue;
    faces[id] = {
      face: 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64'),
      avatar: fs.existsSync(a) ? 'data:image/jpeg;base64,' + fs.readFileSync(a).toString('base64') : null,
      skin: skin[id] || null,
    };
  }
  if (!Object.keys(faces).length) return null;
  return `window.__FAMILY_FACES__=${JSON.stringify(faces)};`;
}

const HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#1b2440">
<title>${TITLE}</title>`;

async function bundle() {
  const res = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    target: ['es2020', 'safari15'],
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    write: false,
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
    logLevel: 'warning',
  });
  return res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}

function page(js, faces, bodyOnly) {
  const scripts = `${faces ? `<script>${faces}</script>\n` : ''}<script>${js}</script>`;
  const body = `<div id="app"></div>\n${scripts}`;
  if (bodyOnly) return `<title>${TITLE}</title>\n<style>html,body{height:100%;margin:0;overflow:hidden;background:#1b2440}:root{padding:0!important}</style>\n${body}\n`;
  return `<!doctype html>\n<html lang="en">\n<head>\n${HEAD}\n<style>html,body{height:100%;margin:0;overflow:hidden;background:#1b2440}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

async function buildAll() {
  const t0 = Date.now();
  const js = await bundle();
  const faces = faceScript();
  fs.writeFileSync(path.join(dist, 'index.html'), page(js, null, false));
  if (faces) {
    fs.writeFileSync(path.join(dist, 'family.html'), page(js, faces, false));
    fs.writeFileSync(path.join(dist, 'artifact.html'), page(js, faces, true));
  }
  const kb = (f) => (fs.statSync(path.join(dist, f)).size / 1024).toFixed(0) + 'KB';
  console.log(`built in ${Date.now() - t0}ms: index.html ${kb('index.html')}${faces ? `, family.html ${kb('family.html')}, artifact.html ${kb('artifact.html')}` : ' (no private faces found)'}`);
}

await buildAll();

if (args.has('--watch')) {
  let timer = null;
  fs.watch(path.join(root, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => buildAll().catch((e) => console.error(e.message)), 120);
  });
  console.log('watching src/ ...');
}
