import { describe, expect, it } from "vitest";
import type { QuartzPluginData } from "@quartz-community/types";
import { resolveEmbedPage } from "../src/resolve";

describe("resolveEmbedPage", () => {
  const files = [
    {
      slug: "zettelkasten/zettel/immersion-and-language-acquisition/language-acquisition",
      frontmatter: {
        title: "Language Acquisition",
        source:
          "Digital Garden/Zettelkasten/zettel/Immersion and Language Acquisition/Language Acquisition.md",
      },
    },
  ] as unknown as QuartzPluginData[];

  it("resolves a full Obsidian source path", () => {
    expect(
      resolveEmbedPage(
        "Digital Garden/Zettelkasten/zettel/Immersion and Language Acquisition/Language Acquisition|Language Acquisition",
        files,
      )?.slug,
    ).toBe("zettelkasten/zettel/immersion-and-language-acquisition/language-acquisition");
  });

  it("resolves a short note title", () => {
    expect(resolveEmbedPage("Language Acquisition", files)?.slug).toBe(
      "zettelkasten/zettel/immersion-and-language-acquisition/language-acquisition",
    );
  });
});
