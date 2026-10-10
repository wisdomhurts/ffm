#!/usr/bin/env bash
# MATI's Campout — full headless verification.
#   1. import the project   2. unit tests   3. smoke-test autopilot
# Fails if any step fails or the logs contain script/parse errors.
# Usage: tools/check.sh [--no-smoke]
set -u
cd "$(dirname "$0")/.."
GODOT="${GODOT:-godot}"
OUT=tests/output
mkdir -p "$OUT"
FILTER='^ALSA|alsa|audio_driver|All audio drivers|at: init_output_device|at: initialize \(servers/audio|^$'
status=0

echo "== import"
timeout 300 "$GODOT" --headless --path . --import >"$OUT/import.log" 2>&1
if grep -E "SCRIPT ERROR|Parse Error|ERROR:" "$OUT/import.log" | grep -vE "$FILTER" | grep -q .; then
  grep -E -A2 "SCRIPT ERROR|Parse Error|ERROR:" "$OUT/import.log" | grep -vE "$FILTER" | head -40
  echo "!! import reported errors"; status=1
fi

echo "== unit tests"
timeout 300 "$GODOT" --headless --path . res://tests/test_runner.tscn >"$OUT/unit.log" 2>&1
code=$?
grep -E "^FAIL|UNIT TESTS" "$OUT/unit.log"
if [ $code -ne 0 ]; then echo "!! unit tests failed (exit $code)"; status=1; fi
if grep -E "SCRIPT ERROR|Parse Error" "$OUT/unit.log" | grep -q .; then
  grep -E -A3 "SCRIPT ERROR|Parse Error" "$OUT/unit.log" | head -40
  echo "!! script errors during unit tests"; status=1
fi

if [ "${1:-}" != "--no-smoke" ]; then
  echo "== smoke test"
  timeout 600 "$GODOT" --headless --path . -- --smoke --seed=424242 >"$OUT/smoke.log" 2>&1
  code=$?
  grep -E "^(PASS|FAIL|SMOKE)" "$OUT/smoke.log"
  if [ $code -ne 0 ]; then echo "!! smoke test failed (exit $code)"; status=1; fi
  if grep -E "SCRIPT ERROR|Parse Error|ERROR:" "$OUT/smoke.log" | grep -vE "$FILTER" | grep -q .; then
    grep -E -A3 "SCRIPT ERROR|Parse Error|ERROR:" "$OUT/smoke.log" | grep -vE "$FILTER" | head -60
    echo "!! errors logged during smoke test"; status=1
  fi
fi

if [ $status -eq 0 ]; then echo "== ALL CHECKS PASSED"; else echo "== CHECKS FAILED"; fi
exit $status
