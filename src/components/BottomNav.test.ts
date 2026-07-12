import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "BottomNav.tsx"), "utf8");
const css = readFileSync(join(here, "BottomNav.module.css"), "utf8");
const screenSrc = readFileSync(join(here, "GameScreen.tsx"), "utf8");

describe("BottomNav floating pill", () => {
  it("exposes icon + label items with Home/Undo/Give-up glyphs", () => {
    expect(src).toMatch(/export interface BottomNavItem/);
    expect(src).toMatch(/items\.map/);
    expect(src).toMatch(/HomeIcon/);
    expect(src).toMatch(/UndoIcon/);
    expect(src).toMatch(/GiveUpIcon/);
    expect(src).toMatch(/styles\.label/);
    expect(src).toMatch(/\{item\.label\}/);
    expect(src).toMatch(/strokeWidth="1\.5"/);
  });

  it("uses a centered floating pill with room for labels and 44px targets", () => {
    expect(css).toMatch(/border-radius:\s*999px/);
    expect(css).toMatch(/--bottom-nav-pill-height:\s*3\.85rem/);
    expect(css).toMatch(/--bottom-nav-float-gap:/);
    expect(css).toMatch(
      /--bottom-nav-total:\s*calc\([\s\S]*env\(safe-area-inset-bottom/,
    );
    expect(css).toMatch(/backdrop-filter:\s*blur/);
    expect(css).toMatch(/var\(--glass\)/);
    expect(css).toMatch(/min-width:\s*3\.55rem/);
    expect(css).toMatch(/min-height:\s*2\.75rem/);
    expect(css).toMatch(/\.label\s*\{[^}]*font-size:\s*0\.62rem/s);
    expect(css).toMatch(/\.label\s*\{[^}]*color:\s*inherit/s);
    expect(css).toMatch(/flex-direction:\s*column/);
  });

  it("wires Home → menu, Undo disabled on short chain, Give up → modal", () => {
    expect(screenSrc).toMatch(/id: "home"/);
    expect(screenSrc).toMatch(/onClick: onBackToMenu/);
    expect(screenSrc).toMatch(/chain\.length <= 1/);
    expect(screenSrc).toMatch(/onClick: openGiveUp/);
  });
});
