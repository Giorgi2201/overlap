import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(here, "tokens.css"), "utf8");
const gameCss = readFileSync(
  join(here, "../components/GameScreen.module.css"),
  "utf8",
);
const panelCss = readFileSync(
  join(here, "../components/ConnectionPanel.module.css"),
  "utf8",
);
const navCss = readFileSync(
  join(here, "../components/BottomNav.module.css"),
  "utf8",
);
const gameSrc = readFileSync(
  join(here, "../components/GameScreen.tsx"),
  "utf8",
);
const navSrc = readFileSync(join(here, "../components/BottomNav.tsx"), "utf8");

describe("shared motion language", () => {
  it("defines quick/standard durations and one easing curve", () => {
    expect(tokens).toMatch(/--ease-motion:\s*cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/);
    expect(tokens).toMatch(/--dur-quick:\s*180ms/);
    expect(tokens).toMatch(/--dur-standard:\s*300ms/);
    expect(tokens).toMatch(/--stagger-step:\s*24ms/);
    expect(tokens).toMatch(/--stagger-cap:\s*8/);
    expect(tokens).toMatch(/--dur-circuit:\s*520ms/);
  });

  it("uses shared tokens for modal, cards, win, options, and pill", () => {
    expect(gameCss).toMatch(/modalBackdropOpen/);
    expect(gameCss).toMatch(/var\(--dur-standard\)\s+var\(--ease-motion\)/);
    expect(gameCss).toMatch(/cardInFromLeft/);
    expect(gameCss).toMatch(/cardInFromRight/);
    expect(gameCss).toMatch(/winItemIn/);
    expect(panelCss).toMatch(/optionIn/);
    expect(panelCss).toMatch(/var\(--stagger-i/);
    expect(navCss).toMatch(/pillIn/);
    expect(navSrc).toMatch(/pillEntranceConsumed/);
    expect(gameSrc).toMatch(/giveUpMounted/);
    expect(gameSrc).toMatch(/cardEnterStart/);
  });

  it("reduces motion to fade-only (no translate/scale) under prefers-reduced-motion", () => {
    expect(gameCss).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*animation-name:\s*fadeOnly/,
    );
    expect(panelCss).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*animation-name:\s*fadeOnly/,
    );
    expect(navCss).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*animation-name:\s*fadeOnly/,
    );
  });
});
