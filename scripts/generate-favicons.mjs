#!/usr/bin/env node
// Author: 0xWulf <dev@0xwulf.dev>
// Description: Rasterize client/public/favicon.svg into favicon.ico (16/32/48 px,
//              PNG-in-ICO) and apple-touch-icon.png (180 px) with Playwright's
//              Chromium. Run after changing favicon.svg:
//                node scripts/generate-favicons.mjs [--dry-run]
//              Set PW_CHROMIUM_PATH if Playwright cannot use its bundled browser.
// Created: 2026-11-20
import { Buffer } from "node:buffer";
import console from "node:console";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const dryRun = process.argv.includes("--dry-run");
const publicDir = resolve(import.meta.dirname, "../client/public");
const svg = readFileSync(resolve(publicDir, "favicon.svg"), "utf8");

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);

/** iOS masks home-screen icons itself and paints transparent corners black: square tile. */
const squareSvg = svg.replace(/rx="\d+"/, 'rx="0"');

async function render(size, source = svg) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}`;
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img src="${dataUrl}" width="${size}" height="${size}" style="display:block"></body></html>`,
  );
  await page.locator("img").evaluate((img) => img.decode());
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  return png;
}

/** ICO container with PNG payloads (supported by every current browser and Windows Vista+). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

try {
  const icoImages = [];
  for (const size of [16, 32, 48]) icoImages.push({ size, png: await render(size) });
  const out = {
    "favicon.ico": ico(icoImages),
    "apple-touch-icon.png": await render(180, squareSvg),
  };
  for (const [name, buf] of Object.entries(out)) {
    const target = resolve(publicDir, name);
    if (dryRun) console.log(`[dry-run] would write ${target} (${buf.length} bytes)`);
    else {
      writeFileSync(target, buf);
      console.log(`wrote ${target} (${buf.length} bytes)`);
    }
  }
} finally {
  await browser.close();
}
