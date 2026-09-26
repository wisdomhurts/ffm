// Build dist/index.html (cartoon faces only) with tests/net/patches.mjs applied in memory, for the
// online browser test. Usage: node tests/net/build-patched.mjs --out <dir>
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { PATCHES } from './patches.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const argv = process.argv.slice(2);
const out = path.resolve(argv[argv.indexOf('--out') + 1] || path.join(ROOT, 'tests/output/net-dist'));
fs.mkdirSync(out, { recursive: true });

const byFile = new Map();
for (const p of PATCHES) {
  const f = path.join(ROOT, p.file);
  if (!byFile.has(f)) byFile.set(f, []);
  byFile.get(f).push(p);
}

const applied = [];
const patcher = {
  name: 'net-patches',
  setup(build) {
    build.onLoad({ filter: /\.js$/ }, (args) => {
      const list = byFile.get(args.path);
      if (!list) return undefined;
      let src = fs.readFileSync(args.path, 'utf8');
      for (const p of list) {
        if (src.includes(p.done)) {
          applied.push(`already in ${p.file}: ${p.why}`);
          continue;
        }
        const n = src.split(p.find).length - 1;
        if (n !== 1) throw new Error(`patch for ${p.file} matches ${n} times: ${p.find.slice(0, 60)}`);
        src = src.replace(p.find, p.replace);
        applied.push(`patched ${p.file}: ${p.why}`);
      }
      return { contents: src, loader: 'js' };
    });
  },
};

const res = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'safari15'],
  minify: true,
  write: false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
  plugins: [patcher],
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>Steal A Seed! Family Edition</title>
<style>html,body{height:100%;margin:0;overflow:hidden;background:#1b2440}</style>
</head>
<body>
<div id="app"></div>
<script>${js}</script>
</body>
</html>
`;
fs.writeFileSync(path.join(out, 'index.html'), html);
for (const a of applied) console.log(a);
console.log(`built ${path.join(out, 'index.html')} (${(html.length / 1024).toFixed(0)} KB)`);
