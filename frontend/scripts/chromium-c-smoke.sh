#!/usr/bin/env bash
set -euo pipefail

# This smoke proof drives the isolated practice route through chrome-devtools-axi.
# Set CHROME_DEVTOOLS_AXI_BROWSER_URL when attaching to an already running Chromium.
export CHROME_DEVTOOLS_AXI_SESSION="${CHROME_DEVTOOLS_AXI_SESSION:-fe-arena-c-smoke}"
axi="${CHROME_DEVTOOLS_AXI_BIN:-chrome-devtools-axi}"
route="${FE_ARENA_C_PRACTICE_URL:-http://127.0.0.1:5173/practice/c}"

"$axi" open "$route" >/dev/null
snapshot="$($axi snapshot)"
if ! grep -q 'button "run tests"' <<<"$snapshot"; then
  printf '%s\n' "$snapshot" >&2
  echo "Chromium smoke could not find the run-tests button." >&2
  exit 1
fi
"$axi" eval '() => { const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "run tests"); if (!button) throw new Error("run-tests button missing"); button.click(); return "run-tests clicked"; }' >/dev/null

for _ in $(seq 1 90); do
  snapshot="$($axi snapshot)"
  if grep -q 'heading "all tests passed"' <<<"$snapshot"; then
    grep -q 'StaticText "mixed values"' <<<"$snapshot"
    grep -q 'StaticText "zero included"' <<<"$snapshot"
    if grep -Eiq 'heading "(compile error|runtime error|timeout)"' <<<"$snapshot"; then
      echo "Chromium smoke reported a typed failure after the success marker." >&2
      exit 1
    fi
    printf '%s\n' "$snapshot"
    exit 0
  fi
  sleep 1
done

printf '%s\n' "$snapshot" >&2
echo "Chromium C smoke did not complete within 90 seconds." >&2
exit 1
