#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Inputs (you can tweak CROP to fine-tune how much of the right side to keep)
SRC="${SRC:-$HOME/uploads/containeryard/containeryard-wordmark.png}"
OUT="${OUT:-client/src/assets/branding/logo-wordmark.svg}"
CROP="${CROP:-72}"   # keep rightmost % of width (try 70–78 if needed)

tmp_png=$(mktemp --suffix=.png)
tmp_pgm=$(mktemp --suffix=.pgm)

echo ">> Source: $SRC"
echo ">> Cropping to right ${CROP}% and removing bg…"

# 1) Remove solid background (top-left sampled), then crop the right side (text)
BG=$(magick "$SRC" -format "%[pixel:p{1,1}]" info:) || BG="none"
magick "$SRC" -alpha on -fuzz 18% -transparent "$BG" \
  -gravity East -crop "${CROP}%x100%+0+0" +repage "$tmp_png"

# 2) Convert alpha to mask and trace
magick "$tmp_png" -alpha extract -threshold 60% -negate "$tmp_pgm"

mkdir -p "$(dirname "$OUT")"
potrace "$tmp_pgm" -s -o "$OUT" \
  --tight --turdsize 20 --alphamax 1.0 --opttolerance 0.4 --longcurve

# 3) Theming + sizing: currentColor + let React control width/height
sed -i \
  -e 's/fill="[^"]*"/fill="currentColor"/g' \
  -e 's/stroke="[^"]*"/stroke="currentColor"/g' \
  -e 's/ width="[^"]*"//; s/ height="[^"]*"//' \
  "$OUT"

echo "✅ Wrote $OUT (text-only wordmark)"
