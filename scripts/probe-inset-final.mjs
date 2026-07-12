import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync("scripts/out", { recursive: true });
const browser = await chromium.launch();

async function shot(label, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  // Bust any stale module graph
  await page.goto("http://127.0.0.1:5173/?t=" + Date.now(), {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: /Continue|New puzzle/i }).click();
  await page.waitForSelector('button[aria-label^="Start:"]');
  await page
    .waitForFunction(() => {
      const imgs = [...document.querySelectorAll('img[class*="photoImg"]')];
      const frame = document.querySelector('[class*="photoFrame"]');
      const pad = frame && getComputedStyle(frame.parentElement).paddingTop;
      return (
        imgs.length >= 2 &&
        imgs.every((i) => i.complete && i.naturalWidth > 0) &&
        parseFloat(pad) >= 8
      );
    }, { timeout: 10000 })
    .catch(() => {});
  await page.waitForTimeout(200);

  const metrics = await page.evaluate(() => {
    const frame = document.querySelector('[class*="photoFrame"]');
    const photo = frame?.parentElement;
    const fr = frame?.getBoundingClientRect();
    const pr = photo?.getBoundingClientRect();
    return {
      inset: pr && fr ? Math.round(fr.left - pr.left) : null,
      pad: photo ? getComputedStyle(photo).padding : null,
      border: frame ? getComputedStyle(frame).borderTopWidth : null,
    };
  });
  console.log(label, metrics);

  const start = page.locator('button[aria-label^="Start:"]').first();
  const target = page.locator('button[aria-label^="Target:"]').first();
  const a = await start.boundingBox();
  const b = await target.boundingBox();
  if (a && b) {
    const x = Math.min(a.x, b.x) - 12;
    const y = Math.min(a.y, b.y) - 12;
    const w = Math.max(a.x + a.width, b.x + b.width) - x + 12;
    const h = Math.max(a.y + a.height, b.y + b.height) - y + 12;
    await page.screenshot({
      path: `scripts/out/${label}.png`,
      clip: { x, y, width: w, height: h },
    });
  }
  await page.screenshot({
    path: `scripts/out/${label}-full.png`,
    fullPage: false,
  });
  await page.close();
}

await shot("inset-after-mobile", { width: 390, height: 844 });
await shot("inset-after-desktop", { width: 1280, height: 800 });
await browser.close();
