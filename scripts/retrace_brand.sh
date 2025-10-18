#!/usr/bin/env bash
set -euo pipefail

# always run from repo root
cd "$(dirname "$0")/.."

ICON=${ICON:?ICON path required}
WORDMARK=${WORDMARK:?WORDMARK path required}
OUT_DIR=${OUT_DIR:-client/src/assets/branding}

mkdir -p "$OUT_DIR"

retrace() {
  local IN="$1" OUT="$2" BG
  # detect tile/background from top-left pixel
  BG=$(magick "$IN" -format "%[pixel:p{1,1}]" info:) || BG="none"
  echo "Detected background for $IN -> $BG"

  # remove background, convert alpha to mask, trace foreground only
  magick "$IN" -alpha on -fuzz 18% -transparent "$BG" \
         -alpha extract -threshold 60% -negate +repage /tmp/trace.pgm

  potrace /tmp/trace.pgm -s -o "$OUT" \
    --tight --turdsize 20 --alphamax 1.0 --opttolerance 0.4 --longcurve

  # themable + scalable
  sed -i \
    -e 's/fill="[^"]*"/fill="currentColor"/g' \
    -e 's/stroke="[^"]*"/stroke="currentColor"/g' \
    -e 's/ width="[^"]*"//; s/ height="[^"]*"//' \
    "$OUT"
}

retrace "$ICON"     "$OUT_DIR/logo-mark.svg"
retrace "$WORDMARK" "$OUT_DIR/logo-wordmark.svg"

echo "Wrote: $OUT_DIR/logo-mark.svg"
echo "Wrote: $OUT_DIR/logo-wordmark.svg"
