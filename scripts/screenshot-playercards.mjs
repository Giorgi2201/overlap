/**
 * Viewport self-check for image-led PlayerCards.
 * Opens the running Vite app, starts a puzzle, measures no page scroll
 * on mobile + desktop, and writes screenshots under scripts/out/.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "out");
mkdirSync(outDir, { recursive: true });

async function probe(label, viewport) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });

  // Dismiss start screen
  const cta = page.getByRole("button", { name: /Continue|New puzzle/i });
  await cta.click();
  await page.waitForSelector("text=Start");

  // Wait for portraits (or initials) to settle
  await page.waitForTimeout(800);

  const metrics = await page.evaluate(() => {
    const screen = document.querySelector("main");
    const cards = [...document.querySelectorAll("main button")].filter((b) =>
      /Start|Target/i.test(b.getAttribute("aria-label") || ""),
    );
    const rects = cards.map((c) => {
      const r = c.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    return {
      scrollY: window.scrollY,
      docScrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      bodyOverflow: getComputedStyle(document.body).overflow,
      mainOverflow: screen ? getComputedStyle(screen).overflow : null,
      mainHeight: screen ? Math.round(screen.getBoundingClientRect().height) : null,
      cardHeights: rects,
      pageNeedsScroll: document.documentElement.scrollHeight > window.innerHeight + 2,
    };
  });

  const shot = join(outDir, `playercard-${label}.png`);
  await page.screenshot({ path: shot, fullPage: false });
  await browser.close();
  return { label, viewport, metrics, shot };
}

const results = [];
results.push(await probe("mobile", { width: 390, height: 844 }));
results.push(await probe("desktop", { width: 1280, height: 800 }));
console.log(JSON.stringify(results, null, 2));
