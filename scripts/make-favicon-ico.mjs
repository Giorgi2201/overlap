/**
 * Render public/overlap-favicon.svg → public/favicon.ico (32+16 PNG frames).
 * One-shot local helper; not part of the app runtime.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = join(root, "public", "overlap-favicon.svg");
const icoPath = join(root, "public", "favicon.ico");
const svg = readFileSync(svgPath);

function pngToIco(pngBuffers) {
  // ICO with embedded PNGs (Vista+). Each entry: 16-byte dir + PNG bytes.
  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const dirs = [];
  for (const png of pngBuffers) {
    // Read IHDR width/height from PNG
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    dirs.push({
      width: w >= 256 ? 0 : w,
      height: h >= 256 ? 0 : h,
      size: png.length,
      offset,
    });
    offset += png.length;
  }
  const out = Buffer.alloc(offset);
  out.writeUInt16LE(0, 0); // reserved
  out.writeUInt16LE(1, 2); // type icon
  out.writeUInt16LE(count, 4);
  let dirAt = 6;
  for (const d of dirs) {
    out[dirAt] = d.width;
    out[dirAt + 1] = d.height;
    out[dirAt + 2] = 0; // colors
    out[dirAt + 3] = 0; // reserved
    out.writeUInt16LE(1, dirAt + 4); // planes
    out.writeUInt16LE(32, dirAt + 6); // bit count
    out.writeUInt32LE(d.size, dirAt + 8);
    out.writeUInt32LE(d.offset, dirAt + 12);
    dirAt += 16;
  }
  let dataAt = headerSize;
  for (const png of pngBuffers) {
    png.copy(out, dataAt);
    dataAt += png.length;
  }
  return out;
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 256, height: 256 },
  deviceScaleFactor: 1,
});
await page.setContent(
  `<!DOCTYPE html><html><body style="margin:0;background:transparent">
   <img id="i" src="data:image/svg+xml;base64,${svg.toString("base64")}" width="256" height="256" />
   </body></html>`,
  { waitUntil: "load" },
);
await page.waitForSelector("#i");
await page.waitForTimeout(200);

const pngs = [];
for (const size of [32, 16]) {
  const buf = await page.locator("#i").screenshot({
    type: "png",
    omitBackground: true,
    // clip via viewport resize
  });
  // Re-render at exact size
  await page.setViewportSize({ width: size, height: size });
  await page.evaluate((s) => {
    const img = document.getElementById("i");
    img.width = s;
    img.height = s;
  }, size);
  await page.waitForTimeout(100);
  pngs.push(
    await page.locator("#i").screenshot({ type: "png", omitBackground: true }),
  );
}

await browser.close();
writeFileSync(icoPath, pngToIco(pngs.map((b) => Buffer.from(b))));
console.log("wrote", icoPath, "bytes", (await import("node:fs")).statSync(icoPath).size);
