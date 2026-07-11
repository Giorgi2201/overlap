import { describe, expect, it } from "vitest";
import {
  HERO_BG_DESKTOP,
  HERO_BG_MOBILE,
  HERO_MOBILE_MAX_WIDTH_PX,
  heroBgSrcForViewport,
} from "./StartScreen";

describe("StartScreen hero video selection", () => {
  it("uses the GameScreen mobile breakpoint (860px)", () => {
    expect(HERO_MOBILE_MAX_WIDTH_PX).toBe(860);
  });

  it("picks exactly one file per viewport — never both", () => {
    expect(heroBgSrcForViewport(true)).toBe(HERO_BG_MOBILE);
    expect(heroBgSrcForViewport(false)).toBe(HERO_BG_DESKTOP);
    expect(heroBgSrcForViewport(true)).not.toBe(heroBgSrcForViewport(false));
  });
});
