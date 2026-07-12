import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraph } from "../lib/graph";
import { playerInitials } from "./PlayerCard";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "PlayerCard.module.css"), "utf8");
const cardSrc = readFileSync(join(here, "PlayerCard.tsx"), "utf8");
const screenCss = readFileSync(join(here, "GameScreen.module.css"), "utf8");

describe("playerInitials fallback", () => {
  it("builds clean initials for common name shapes", () => {
    expect(playerInitials("Lionel Messi")).toBe("LM");
    expect(playerInitials("Neymar")).toBe("NE");
    expect(playerInitials("  Vinicius  Junior ")).toBe("VJ");
    expect(playerInitials("")).toBe("?");
  });
});

describe("player imageUrl + image-led card layout", () => {
  const g = loadGraph();

  it("threads Transfermarkt imageUrl onto the full 1000-player pool", () => {
    expect(g.players.size).toBe(1000);
    let withUrl = 0;
    for (const p of g.players.values()) {
      if (p.imageUrl) {
        withUrl++;
        expect(p.imageUrl).toMatch(/^https:\/\/img\.a\.transfermarkt\.technology\//);
      }
    }
    expect(withUrl).toBe(1000);
  });

  it("reserves a dedicated top photo plane + compressed text body", () => {
    expect(cardSrc).toMatch(/PhotoSlot/);
    expect(cardSrc).toMatch(/photoInitials/);
    expect(css).toMatch(/\.photo\s*\{/s);
    expect(css).toMatch(/object-fit:\s*cover/);
    expect(css).toMatch(/\.body\s*\{/s);
    expect(css).toMatch(/\.compact\s*\{[^}]*height:\s*clamp/s);
  });

  it("shows mono club tenure years under the club line", () => {
    expect(cardSrc).toMatch(/clubYears/);
    expect(css).toMatch(/\.clubYears\s*\{[^}]*font-family:\s*var\(--font-mono\)/s);
    expect(css).toMatch(/\.clubBlock\s*\{/);
  });

  it("insets a framed portrait with role-colored ring and face-biased crop", () => {
    expect(cardSrc).toMatch(/photoFrame/);
    expect(css).toMatch(/\.photo\s*\{[^}]*padding:/s);
    expect(css).toMatch(/\.photoFrameStart\s*\{[^}]*var\(--signal\)/s);
    expect(css).toMatch(/\.photoFrameTarget\s*\{[^}]*var\(--beacon\)/s);
    expect(css).toMatch(/aspect-ratio:\s*2\s*\/\s*3/);
    expect(css).toMatch(/object-fit:\s*cover/);
    expect(css).toMatch(/object-position:\s*center\s+12%/);
    expect(css).not.toMatch(/\.photoFade\s*\{/);
  });

  it("keeps matched fixed card heights (start/target identical footprint)", () => {
    expect(css).toMatch(/\.card\s*\{[^}]*height:\s*20\.5rem/s);
    expect(css).toMatch(/\.nationalTeamEmpty\s*\{[^}]*visibility:\s*hidden/s);
    expect(css).toMatch(/\.hintHidden\s*\{/);
  });

  it("preserves the no-page-scroll game shell", () => {
    expect(screenCss).toMatch(/\.screen\s*\{[^}]*height:\s*100svh/s);
    expect(screenCss).toMatch(/\.screen\s*\{[^}]*overflow:\s*hidden/s);
    expect(screenCss).toMatch(/\.board\s*\{[^}]*min-height:\s*0/s);
    expect(screenCss).toMatch(/\.panelSlot\s*\{[^}]*min-height:\s*0/s);
  });
});
