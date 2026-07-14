import { describe, expect, it } from "vitest";

import { slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Q3 Roadmap!")).toBe("q3-roadmap");
    expect(slugify("  Hello  World  ")).toBe("hello-world");
  });

  it("falls back to 'board' for empty/symbol-only input", () => {
    expect(slugify("   ")).toBe("board");
    expect(slugify("!!!")).toBe("board");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when it is free", () => {
    expect(uniqueSlug("roadmap", new Set())).toBe("roadmap");
  });

  it("appends a numeric suffix on collision", () => {
    expect(uniqueSlug("roadmap", new Set(["roadmap"]))).toBe("roadmap-2");
    expect(uniqueSlug("roadmap", new Set(["roadmap", "roadmap-2"]))).toBe(
      "roadmap-3",
    );
  });
});
