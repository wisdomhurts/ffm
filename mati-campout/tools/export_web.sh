#!/usr/bin/env bash
# MATI's Campout - export the browser build (desktop + phones/tablets).
#
#   tools/export_web.sh            export "Web" -> build/web/, copy to web/site/play/
#   tools/export_web.sh --no-copy  export only
#
# Steps: builds the HTML shell (web/shell/shell.src.html -> index.html with
# the Fredoka font inlined), renders the PWA icons if missing, imports the
# project, exports the "Web" preset (no-threads template, Compatibility
# renderer, PWA) and prints the download sizes (raw and gzip).
# build/ and web/site/play/ are gitignored: publishing the binaries is a
# separate decision (see docs/ARCHITECTURE.md "Mobile & web").
set -euo pipefail
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"
OUT=build/web
SITE=web/site/play

echo "== shell"
python3 - <<'PY'
import base64, pathlib
src = pathlib.Path("web/shell/shell.src.html").read_text()
font = base64.b64encode(pathlib.Path("assets/fonts/fredoka-latin-700-normal.woff2").read_bytes()).decode()
out = src.replace("/*FREDOKA_700_BASE64*/", font)
pathlib.Path("web/shell/index.html").write_text(out)
print("web/shell/index.html", len(out), "bytes")
PY

if [ ! -f web/shell/icon-512.png ]; then
  echo "== icons"
  "$GODOT" --headless --path . -s res://tools/gen_web_icons.gd
fi

echo "== import"
timeout 600 "$GODOT" --headless --path . --import >/dev/null 2>&1 || true

echo "== export Web"
rm -rf "$OUT"
mkdir -p "$OUT"
timeout 900 "$GODOT" --headless --path . --export-release "Web" "$OUT/index.html" 2>&1 \
  | sed 's/\x1b\[[0-9;]*m//g' | grep -vE "^ALSA|alsa|audio_driver|All audio drivers|init_output_device|initialize \(servers/audio|^\s*$|^\[ *[0-9]+% \]|^\[ DONE \]" || true
if [ ! -f "$OUT/index.pck" ] || [ ! -f "$OUT/index.wasm" ]; then
  echo "!! export failed (no index.pck / index.wasm)"; exit 1
fi

# Godot writes the project name into a single-quoted JS string in the
# service worker; the apostrophe in "MATI's Campout" breaks it (the PWA
# would never install). Use a safe cache prefix.
python3 - "$OUT/index.service.worker.js" <<'PY'
import re, sys, pathlib
p = pathlib.Path(sys.argv[1])
s = p.read_text()
s2 = re.sub(r"const CACHE_PREFIX = '.*?-sw-cache-';", "const CACHE_PREFIX = 'MATIsCampout-sw-cache-';", s)
p.write_text(s2)
print("  service worker cache prefix fixed" if s2 != s else "  service worker unchanged")
PY

echo "== sizes"
for f in "$OUT"/index.wasm "$OUT"/index.pck "$OUT"/index.js "$OUT"/index.html; do
  raw=$(stat -c %s "$f")
  gz=$(gzip -9 -c "$f" | wc -c)
  printf "  %-24s %8.2f MB  (gzip %6.2f MB)\n" "$(basename "$f")" "$(echo "$raw/1048576" | bc -l)" "$(echo "$gz/1048576" | bc -l)"
done
du -sh "$OUT" | sed 's/^/  total: /'

if [ "${1:-}" != "--no-copy" ]; then
  echo "== copy -> $SITE"
  rm -rf "$SITE"
  mkdir -p "$SITE"
  cp -r "$OUT"/. "$SITE"/
  echo "  served at /play/ by web/site (vercel.json)"
fi
echo "== done: serve with  (cd $OUT && python3 -m http.server 8060)  then open http://localhost:8060/"
