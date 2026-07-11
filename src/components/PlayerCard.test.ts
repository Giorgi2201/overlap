import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraph } from "../lib/graph";
import { playerInitials } from "./PlayerCard";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "PlayerCard.module.css"), "utf8");

describe("playerInitials fallback", () => {
  it("builds clean initials for common name shapes", () => {
    expect(playerInitials("Lionel Messi")).toBe("LM");
    expect(playerInitials("Neymar")).toBe("NE");
    expect(playerInitials("  Vinicius  Junior ")).toBe("VJ");
    expect(playerInitials("")).toBe("?");
  });
});

describe("player imageUrl data + card footprint", () => {
  const g = loadGraph();

  it("threads Transfermarkt imageUrl onto pool players", () => {
    const withUrl = [...g.players.values()].filter((p) => p.imageUrl);
    expect(withUrl.length).toBe(g.players.size);
    expect(withUrl[0].imageUrl).toMatch(
      /^https:\/\/img\.a\.transfermarkt\.technology\//,
    );
  });

  it("covers a known star WITH an image and supports missing-URL fallback path", () => {
    const messi = g.players.get("28003");
    expect(messi?.name).toMatch(/Messi/);
    expect(messi?.imageUrl).toMatch(/28003/);

    // Fallback path: no URL → initials still produce a clean placeholder.
    expect(playerInitials(messi!.name)).toBe("LM");
    expect(playerInitials("Unknown Player")).toBe("UP");
  });

  it("keeps the avatar inside a side-by-side top row (does not stack to grow height)", () => {
    // Layout contract: .top is flex row; avatar is a fixed rem circle.
    expect(css).toMatch(/\.top\s*\{[^}]*display:\s*flex/s);
    expect(css).toMatch(/\.avatar\s*\{[^}]*width:\s*2\.75rem/s);
    expect(css).toMatch(/\.compact\s+\.avatar\s*\{[^}]*width:\s*2\.35rem/s);
    // Game screen still locks to viewport — regression guard.
    const screenCss = readFileSync(join(here, "GameScreen.module.css"), "utf8");
    expect(screenCss).toMatch(/\.screen\s*\{[^}]*overflow:\s*hidden/s);
    expect(screenCss).toMatch(/\.screen\s*\{[^}]*height:\s*100svh/s);
  });
});
