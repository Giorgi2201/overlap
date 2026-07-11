import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraph } from "../lib/graph";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "PlayerCard.module.css"), "utf8");

describe("PlayerCard text-only layout", () => {
  const g = loadGraph();

  it("does not ship player imageUrl fields anymore", () => {
    const anyImage = [...g.players.values()].some(
      (p) => "imageUrl" in p && (p as { imageUrl?: unknown }).imageUrl,
    );
    expect(anyImage).toBe(false);
  });

  it("shows entity names in full — no ellipsis clamp on club/NT lines", () => {
    expect(css).toMatch(/\.club\s*,\s*\n?\.nationalTeam|\.club,\s*\.nationalTeam/s);
    expect(css).toMatch(/white-space:\s*normal/);
    expect(css).not.toMatch(/\.club[^{]*\{[^}]*text-overflow:\s*ellipsis/s);
    expect(css).not.toMatch(/\.club[^{]*\{[^}]*-webkit-line-clamp/s);
    expect(css).not.toMatch(/\.avatar\s*\{/);
  });

  it("keeps matched content-sized cards (no column stretch)", () => {
    expect(css).toMatch(/\.card\s*\{[^}]*height:\s*fit-content/s);
    expect(css).toMatch(/\.compact\s*\{[^}]*height:\s*fit-content/s);
    expect(css).toMatch(/\.hintHidden\s*\{/);

    const screenCss = readFileSync(join(here, "GameScreen.module.css"), "utf8");
    expect(screenCss).toMatch(/\.screen\s*\{[^}]*overflow:\s*hidden/s);
    expect(screenCss).toMatch(/\.board\s*\{[^}]*align-items:\s*start/s);
    expect(screenCss).toMatch(/\.cardSlot\s*\{[^}]*height:\s*fit-content/s);
  });

  it("covers long club names present in the dataset (Al-Hilal-class)", async () => {
    const longClubs = [...g.entities.values()].filter(
      (e) => e.type === "club" && e.name.length > 28,
    );
    expect(longClubs.length).toBeGreaterThan(0);
    const hilal = longClubs.find((e) => /hilal/i.test(e.name));
    if (hilal) {
      expect(hilal.name.includes("…")).toBe(false);
      expect(hilal.name.length).toBeGreaterThan(20);
    }
  });
});
