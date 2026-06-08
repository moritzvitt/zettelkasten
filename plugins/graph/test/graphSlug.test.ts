import { describe, expect, it } from "vitest"

import { canonicalGraphSlug, resolveGraphSlug } from "../src/components/scripts/graphSlug"

describe("graph slug resolution", () => {
  it("prefers the canonical slug rendered into the page", () => {
    expect(
      canonicalGraphSlug(
        "immersion/mühelose-aufmerksamkeit-ist-der-nordstern-der-immersion",
        "/zettelkasten/immersion/m%C3%BChelose-aufmerksamkeit-ist-der-nordstern-der-immersion",
      ),
    ).toBe("immersion/mühelose-aufmerksamkeit-ist-der-nordstern-der-immersion")
  })

  it("matches a content-index slug when the URL contains the GitHub Pages base path", () => {
    const slugs = new Set([
      "immersion/mühelose-aufmerksamkeit-ist-der-nordstern-der-immersion",
    ])

    expect(
      resolveGraphSlug(
        "/zettelkasten/immersion/m%C3%BChelose-aufmerksamkeit-ist-der-nordstern-der-immersion.html",
        slugs,
      ),
    ).toBe("immersion/mühelose-aufmerksamkeit-ist-der-nordstern-der-immersion")
  })
})
