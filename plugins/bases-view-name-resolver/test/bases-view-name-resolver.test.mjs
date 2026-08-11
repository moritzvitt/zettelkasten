import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { render } from "preact-render-to-string"

import {
  applyObsidianBaseViews,
  applyObsidianCardLayout,
  BasesViewNameResolver,
  configureObsidianBasesPage,
  ObsidianCardsView,
  resolveBaseViewName,
} from "../src/index.js"

const baseSource = `
views:
  - type: cards
    name: all published files
  - type: table
    name: Japanese (YT) videos
`

test("resolves a slugified embed fragment to the original Bases view name", () => {
  assert.equal(resolveBaseViewName("all-published-files", baseSource), "all published files")
})

test("matches existing exact view names case-insensitively", () => {
  assert.equal(resolveBaseViewName("ALL PUBLISHED FILES", baseSource), "all published files")
})

test("supports punctuation normalized by Obsidian Flavored Markdown", () => {
  assert.equal(resolveBaseViewName("japanese-yt-videos", baseSource), "Japanese (YT) videos")
})

test("does not rewrite an unknown view fragment", () => {
  assert.equal(resolveBaseViewName("missing-view", baseSource), undefined)
})

test("turns a published Base view embed into an inline Bases placeholder", () => {
  const contentRoot = fs.mkdtempSync(path.join(os.tmpdir(), "base-view-embed-"))
  const basePath = "tea-garden/japanese-media.base"
  fs.mkdirSync(path.join(contentRoot, "tea-garden"), { recursive: true })
  fs.writeFileSync(path.join(contentRoot, basePath), baseSource)

  const transclude = {
    type: "element",
    tagName: "blockquote",
    properties: {
      className: ["transclude"],
      dataUrl: "tea-garden/japanese-media.base",
      dataBlock: "#all-published-files",
    },
    children: [],
  }
  const tree = { type: "root", children: [transclude] }
  const file = { data: {} }

  try {
    const plugin = BasesViewNameResolver()
    plugin.htmlPlugins({ argv: { directory: contentRoot }, allFiles: [basePath] })[0]()(tree, file)

    assert.deepEqual(file.data.basesBlocks, [
      {
        views: [
          { type: "cards", name: "all published files" },
          { type: "table", name: "Japanese (YT) videos" },
        ],
      },
    ])
    assert.ok(tree.children[0].properties.className.includes("obsidian-bases-cards"))
    const placeholder = tree.children[0].children[0]
    assert.equal(placeholder.tagName, "div")
    assert.equal(placeholder.properties.dataQzBasesCodeblock, "0")
    assert.equal(placeholder.properties.dataQzBasesView, "all published files")
  } finally {
    fs.rmSync(contentRoot, { recursive: true, force: true })
  }
})

test("returns undefined for malformed Bases YAML", () => {
  assert.equal(resolveBaseViewName("all-published-files", "views: ["), undefined)
})

test("applies Obsidian card width and image layout without empty placeholders", () => {
  const image = {
    type: "element",
    tagName: "div",
    properties: { className: ["bases-card-image"], style: "aspect-ratio:0.65;" },
    children: [],
  }
  const title = {
    type: "element",
    tagName: "span",
    properties: { className: ["bases-card-title"] },
    children: [{ type: "text", value: "A long title" }],
  }
  const cardWithImage = {
    type: "element",
    tagName: "a",
    properties: { className: ["bases-card"] },
    children: [image, title],
  }
  const cardWithoutImage = {
    type: "element",
    tagName: "a",
    properties: { className: ["bases-card"] },
    children: [structuredClone(title)],
  }
  const grid = {
    type: "element",
    tagName: "div",
    properties: {
      className: ["bases-cards"],
      style: "grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));",
    },
    children: [cardWithImage, cardWithoutImage],
  }
  const root = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "div",
        properties: {
          className: ["obsidian-bases-cards"],
          dataObsidianCardSize: "120",
          dataObsidianImageAspectRatio: "0.65",
          dataObsidianHasImage: "true",
          dataObsidianHideCover: "false",
        },
        children: [grid],
      },
    ],
  }

  applyObsidianCardLayout(root)

  assert.match(grid.properties.style, /repeat\(auto-fill, minmax\(min\(120px, 100%\), 120px\)\)/)
  assert.match(grid.properties.style, /align-items:start/)
  assert.match(image.properties.style, /aspect-ratio:1\.53846/)
  assert.equal(cardWithoutImage.children.length, 1)
  assert.equal(cardWithoutImage.children[0].properties.className[0], "bases-card-title")
  assert.match(title.properties.style, /text-overflow:ellipsis/)
})

test("applies standalone card settings, sorting, and grouping from the selected Base view", () => {
  const card = (slug) => ({
    type: "element",
    tagName: "a",
    properties: { className: ["bases-card"], dataSlug: slug },
    children: [
      {
        type: "element",
        tagName: "div",
        properties: { className: ["bases-card-image"], style: "aspect-ratio:0.85;" },
        children: [
          {
            type: "element",
            tagName: "img",
            properties: { style: "object-fit:cover;" },
            children: [],
          },
        ],
      },
    ],
  })
  const grid = {
    type: "element",
    tagName: "div",
    properties: { className: ["bases-cards"] },
    children: [card("video-z"), card("video-a")],
  }
  const view = {
    type: "element",
    tagName: "div",
    properties: {
      className: ["bases-view", "is-active"],
      dataViewIndex: "0",
      dataViewType: "cards",
    },
    children: [grid],
  }
  const root = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "div",
        properties: { className: ["bases-page"] },
        children: [view],
      },
    ],
  }
  const basesData = {
    views: [
      {
        type: "cards",
        name: "all japanese videos",
        cardSize: 150,
        image: "note.cover",
        imageFit: "contain",
        imageAspectRatio: 0.85,
        groupBy: { property: "creator", direction: "ASC" },
        sort: [
          { property: "creator", direction: "ASC" },
          { property: "title", direction: "ASC" },
        ],
      },
    ],
  }
  const allFiles = [
    { slug: "video-z", frontmatter: { title: "Zulu", creator: "TAKASHii" } },
    { slug: "video-a", frontmatter: { title: "Alpha", creator: "Kenshi Yonezu 米津玄師" } },
  ]

  applyObsidianBaseViews(root, basesData, allFiles)

  assert.ok(view.properties.className.includes("obsidian-bases-cards"))
  assert.match(grid.properties.style, /min\(150px, 100%\), 150px/)
  assert.match(grid.children[0].children[0].properties.style, /aspect-ratio:1\.17647/)
  assert.match(grid.children[0].children[0].children[0].properties.style, /object-fit:contain/)

  const groups = view.children.filter(
    (node) => node.type === "element" && node.properties.className?.includes("bases-card-group"),
  )
  assert.deepEqual(
    groups.map((group) => group.properties.dataGroupValue),
    ["Kenshi Yonezu 米津玄師", "TAKASHii"],
  )
  assert.deepEqual(
    groups.map((group) => group.children[1].children[0].properties.dataSlug),
    ["video-a", "video-z"],
  )
})

test("renders standalone Bases cards with the Obsidian view configuration", () => {
  const view = {
    type: "cards",
    image: "note.cover",
    imageFit: "contain",
    imageAspectRatio: 0.85,
    cardSize: 150,
    order: ["title", "creator"],
    groupBy: { property: "creator", direction: "ASC" },
  }
  const entry = (slug, title, creator, cover = `https://example.com/${slug}.jpg`) => ({
    slug,
    title,
    properties: { title, creator, ...(cover ? { cover } : {}) },
    fileProperties: {},
    formulaValues: {},
  })
  const html = render(
    ObsidianCardsView({
      entries: [
        entry("alpha", "Alpha", "Kenshi Yonezu 米津玄師"),
        entry("zulu", "Zulu", "TAKASHii"),
        entry("without-cover", "Without cover", "TAKASHii", ""),
      ],
      view,
      basesData: {},
      total: 3,
      slug: "media.base",
      allSlugs: ["alpha", "zulu"],
      linkResolution: "shortest",
    }),
  )

  assert.match(html, /obsidian-bases-cards/)
  assert.match(html, /repeat\(auto-fill, minmax\(min\(150px, 100%\), 150px\)\)/)
  assert.match(html, /aspect-ratio:1\.1764705882352942/)
  assert.match(html, /object-fit:contain/)
  assert.match(html, /margin:0/)
  assert.match(html, /border-radius:0/)
  assert.match(html, /width:calc\(100% \+ 2px\)/)
  assert.match(html, /margin:-1px -1px 0(?:px)?/)
  assert.doesNotMatch(html, /obsidian-card-placeholder/)
  assert.equal((html.match(/class="bases-card-image"/g) ?? []).length, 2)
  assert.match(html, /data-group-value="Kenshi Yonezu 米津玄師"/)
  assert.ok(html.indexOf("Kenshi Yonezu 米津玄師") < html.indexOf("TAKASHii"))
  assert.match(html, /bases-card-label">creator/)
  assert.doesNotMatch(html, /bases-card-label">title/)
})

test("injects the Obsidian cards renderer into standalone Bases options", () => {
  const componentData = {
    fileData: {
      basesData: { views: [{ type: "cards" }] },
      basesOptions: { linkResolution: "shortest" },
    },
  }

  configureObsidianBasesPage({ type: "root", children: [] }, "media.base", componentData)

  assert.equal(componentData.fileData.basesOptions.linkResolution, "shortest")
  assert.equal(componentData.fileData.basesOptions.customViews.cards, ObsidianCardsView)
  assert.equal(componentData.fileData.basesOptions.customViews["mx-media-lib"], ObsidianCardsView)
})
