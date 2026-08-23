import { readFileSync } from "node:fs"
import { join } from "node:path"

import { slug as githubSlug } from "github-slugger"
import { h } from "preact"
import { slugifyFilePath, transformLink } from "@quartz-community/utils"
import { SKIP, visit } from "unist-util-visit"
import { parse } from "yaml"

function resolveBaseView(fragment, rawBase) {
  if (typeof fragment !== "string" || !fragment) return undefined

  let data
  try {
    data = parse(rawBase)
  } catch {
    return undefined
  }

  if (!data || !Array.isArray(data.views)) return undefined

  const requested = fragment.toLowerCase()
  const namedViews = data.views.filter((view) => typeof view?.name === "string")
  const exactMatch = namedViews.find((view) => view.name.toLowerCase() === requested)
  if (exactMatch) return exactMatch

  return namedViews.find((view) => githubSlug(view.name) === requested)
}

export function resolveBaseViewName(fragment, rawBase) {
  return resolveBaseView(fragment, rawBase)?.name
}

export function buildBaseFileLookup(allFiles) {
  const lookup = new Map()

  for (const filePath of allFiles.filter((candidate) => candidate.endsWith(".base"))) {
    const fullSlug = slugifyFilePath(filePath)
    lookup.set(fullSlug, filePath)

    const fileName = filePath.split("/").pop() ?? ""
    const fileNameSlug = slugifyFilePath(fileName)
    if (!lookup.has(fileNameSlug)) lookup.set(fileNameSlug, filePath)

    const nameOnly = fileName.replace(/\.base$/, "")
    const nameSlug = slugifyFilePath(nameOnly)
    if (!lookup.has(nameSlug)) lookup.set(nameSlug, filePath)
  }

  return lookup
}

function hasClass(node, className) {
  return Array.isArray(node?.properties?.className)
    ? node.properties.className.includes(className)
    : false
}

function descendants(node, predicate) {
  const matches = []
  visit(node, "element", (candidate) => {
    if (predicate(candidate)) matches.push(candidate)
  })
  return matches
}

function mergeStyle(style, declarations) {
  const values = new Map()
  for (const declaration of String(style ?? "").split(";")) {
    const separator = declaration.indexOf(":")
    if (separator < 0) continue
    values.set(declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim())
  }
  for (const [property, value] of Object.entries(declarations)) values.set(property, value)
  return [...values].map(([property, value]) => `${property}:${value}`).join(";") + ";"
}

function textContent(node) {
  if (node?.type === "text") return node.value
  return (node?.children ?? []).map(textContent).join("")
}

function finitePositive(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function entryPropertyValue(entry, property) {
  const valuePath = String(property ?? "").trim()
  if (!valuePath) return undefined
  let root = entry.properties
  let parts = valuePath.split(".")
  if (parts[0] === "note") parts = parts.slice(1)
  else if (parts[0] === "file") {
    root = entry.fileProperties
    parts = parts.slice(1)
  } else if (parts[0] === "formula") {
    root = entry.formulaValues
    parts = parts.slice(1)
  }
  let value = root
  for (const part of parts) {
    if (!value || typeof value !== "object") return undefined
    value = value[part]
  }
  return value
}

function displayValue(value) {
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(", ")
  if (value instanceof Date) return value.toLocaleDateString("de")
  if (value === true) return "✓"
  if (value === false) return ""
  return value === undefined || value === null ? "" : String(value)
}

function resolveCardImage(raw, { slug, allSlugs, linkResolution }) {
  const value = String(raw ?? "")
  const wikilink = value.match(/^\[\[(.+?)(?:\|.*)?\]\]$/)
  if (!wikilink) return value
  return String(
    transformLink(slug, wikilink[1].trim(), {
      strategy: linkResolution,
      allSlugs,
    }),
  )
}

function propertyLabel(property, basesData) {
  return (
    basesData.properties?.[property]?.displayName ??
    property
      .replace(/^(?:note|file|formula)\./, "")
      .split(".")
      .at(-1)
  )
}

export function ObsidianCardsView({
  entries,
  view,
  basesData,
  total,
  slug,
  allSlugs,
  linkResolution,
}) {
  const imageProperty = typeof view.image === "string" ? view.image : undefined
  const imageRatio = finitePositive(view.imageAspectRatio ?? view.cardAspect)
  const cssImageRatio = imageRatio ? 1 / imageRatio : undefined
  const imageFit = view.imageFit === "contain" ? "contain" : "cover"
  const cardSize = finitePositive(view.cardSize) ?? 220
  const columns = Array.isArray(view.order)
    ? view.order.filter(
        (property) =>
          property !== imageProperty && property !== "file.name" && property !== "title",
      )
    : []
  const groups = new Map()
  for (const entry of entries) {
    const rawGroup = view.groupBy?.property
      ? entryPropertyValue(entry, view.groupBy.property)
      : undefined
    const group = view.groupBy?.property ? displayValue(rawGroup) || "—" : ""
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(entry)
  }

  const grid = (groupEntries) =>
    h(
      "div",
      {
        class: "bases-cards",
        style: {
          gridTemplateColumns: `repeat(auto-fill, minmax(min(${cardSize}px, 100%), ${cardSize}px))`,
          alignItems: "start",
          justifyContent: "start",
          gap: "10px",
        },
      },
      groupEntries.map((entry) => {
        const rawImage = imageProperty ? entryPropertyValue(entry, imageProperty) : undefined
        const imageSrc = resolveCardImage(rawImage, { slug, allSlugs, linkResolution })
        const href = transformLink(slug, entry.slug, {
          strategy: linkResolution,
          allSlugs,
        })
        const rows = columns
          .map((property) => [property, displayValue(entryPropertyValue(entry, property))])
          .filter(([, value]) => value)
        return h(
          "a",
          {
            href,
            class: "internal internal-link bases-card",
            "data-slug": entry.slug,
            style: {
              width: "100%",
              minWidth: 0,
              alignSelf: "start",
              borderRadius: "6px",
              boxShadow: "none",
            },
          },
          imageSrc &&
            h(
              "div",
              {
                class: "bases-card-image",
                style: {
                  ...(cssImageRatio ? { aspectRatio: String(cssImageRatio) } : {}),
                  width: "calc(100% + 2px)",
                  margin: "-1px -1px 0",
                  padding: 0,
                  lineHeight: 0,
                  background: "transparent",
                },
              },
              h("img", {
                src: imageSrc,
                alt: entry.title,
                loading: "lazy",
                style: {
                  objectFit: imageFit,
                  width: "100%",
                  height: "100%",
                  maxWidth: "none",
                  display: "block",
                  margin: 0,
                  borderRadius: 0,
                },
              }),
            ),
          h(
            "div",
            { class: "bases-card-body", style: { padding: "6px 8px", minWidth: 0 } },
            h(
              "span",
              {
                class: "bases-card-title",
                title: entry.title,
                style: {
                  display: "block",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                },
              },
              entry.title,
            ),
            h(
              "div",
              { class: "bases-card-meta" },
              rows.map(([property, value]) =>
                h(
                  "div",
                  { class: "bases-card-row" },
                  h("span", { class: "bases-card-label" }, propertyLabel(property, basesData)),
                  h("span", { class: "bases-card-value" }, value),
                ),
              ),
            ),
          ),
        )
      }),
    )

  return h(
    "div",
    { class: "bases-cards-wrapper obsidian-bases-cards" },
    h("div", { class: "bases-view-meta" }, `Showing ${entries.length} of ${total} entries`),
    [...groups].map(([group, groupEntries]) =>
      h(
        "div",
        { class: "bases-card-group", "data-group-value": group, style: { marginBottom: "18px" } },
        view.groupBy?.property
          ? h(
              "div",
              {
                class: "bases-card-group-header",
                style: {
                  display: "flex",
                  alignItems: "baseline",
                  gap: "6px",
                  margin: "0 0 8px",
                  fontSize: "0.85rem",
                },
              },
              h("span", null, view.groupBy.property),
              h("strong", null, group),
            )
          : null,
        grid(groupEntries),
      ),
    ),
  )
}

function addClass(node, className) {
  const classes = Array.isArray(node?.properties?.className) ? node.properties.className : []
  if (!classes.includes(className)) classes.push(className)
  node.properties.className = classes
}

function propertyValue(file, property) {
  const frontmatter = file?.frontmatter ?? {}
  const valuePath = String(property ?? "").trim()
  if (!valuePath) return undefined

  let root = frontmatter
  let parts = valuePath.split(".")
  if (parts[0] === "note") parts = parts.slice(1)
  else if (parts[0] === "file") {
    const relativePath = String(file?.relativePath ?? file?.filePath ?? `${file?.slug ?? ""}.md`)
    const fileName = relativePath.split("/").pop() ?? ""
    const extensionIndex = fileName.lastIndexOf(".")
    const basename = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
    root = {
      name: basename,
      basename,
      path: relativePath,
      folder: relativePath.includes("/")
        ? relativePath.slice(0, relativePath.lastIndexOf("/"))
        : "",
      ext: extensionIndex > 0 ? fileName.slice(extensionIndex + 1) : "",
      tags: frontmatter.tags,
    }
    parts = parts.slice(1)
  } else if (parts[0] === "formula" || parts[0] === "this") {
    return undefined
  }

  let value = root
  for (const part of parts) {
    if (!value || typeof value !== "object") return undefined
    value = value[part]
  }
  return value
}

function compareValues(left, right) {
  if (left === right) return 0
  if (left === undefined || left === null || left === "") return 1
  if (right === undefined || right === null || right === "") return -1
  if (typeof left === "number" && typeof right === "number") return left - right
  return String(left).localeCompare(String(right), "de")
}

function cardSlug(card) {
  return card?.properties?.dataSlug ?? card?.properties?.["data-slug"]
}

function cardFile(card, filesBySlug) {
  return filesBySlug.get(cardSlug(card))
}

function sortCards(cards, view, filesBySlug) {
  const sort =
    Array.isArray(view.sort) && view.sort.length
      ? view.sort
      : view.groupBy?.property
        ? [view.groupBy]
        : Array.isArray(view.order)
          ? view.order.map((property) => ({ property, direction: "ASC" }))
          : []
  if (!sort.length) return cards

  return [...cards].sort((left, right) => {
    for (const entry of sort) {
      const comparison = compareValues(
        propertyValue(cardFile(left, filesBySlug), entry.property),
        propertyValue(cardFile(right, filesBySlug), entry.property),
      )
      if (comparison !== 0) return entry.direction === "DESC" ? -comparison : comparison
    }
    return 0
  })
}

function findParent(root, target) {
  for (const child of root?.children ?? []) {
    if (child === target) return root
    if (child.type === "element") {
      const parent = findParent(child, target)
      if (parent) return parent
    }
  }
  return undefined
}

function groupCards(root, grid, view, filesBySlug) {
  const cards = grid.children.filter(
    (child) => child.type === "element" && hasClass(child, "bases-card"),
  )
  const sortedCards = sortCards(cards, view, filesBySlug)
  grid.children = sortedCards

  const groupProperty = view.groupBy?.property
  if (!groupProperty) return

  const grouped = new Map()
  for (const card of sortedCards) {
    const rawValue = propertyValue(cardFile(card, filesBySlug), groupProperty)
    const value = Array.isArray(rawValue) ? rawValue.join(", ") : String(rawValue ?? "—")
    if (!grouped.has(value)) grouped.set(value, [])
    grouped.get(value).push(card)
  }

  const parent = findParent(root, grid)
  const gridIndex = parent?.children?.indexOf(grid) ?? -1
  if (!parent || gridIndex < 0) return

  const groups = [...grouped].map(([value, groupCards], index) => {
    const groupGrid =
      index === 0
        ? grid
        : {
            type: "element",
            tagName: "div",
            properties: { ...grid.properties, className: [...grid.properties.className] },
            children: [],
          }
    groupGrid.children = groupCards
    return {
      type: "element",
      tagName: "div",
      properties: {
        className: ["bases-card-group"],
        dataGroupValue: value,
        style: "margin-bottom:18px;",
      },
      children: [
        {
          type: "element",
          tagName: "div",
          properties: {
            className: ["bases-card-group-header"],
            style: "display:flex;align-items:baseline;gap:6px;margin:0 0 8px;font-size:0.85rem;",
          },
          children: [
            {
              type: "element",
              tagName: "span",
              properties: {},
              children: [{ type: "text", value: groupProperty }],
            },
            {
              type: "element",
              tagName: "strong",
              properties: {},
              children: [{ type: "text", value }],
            },
          ],
        },
        groupGrid,
      ],
    }
  })
  parent.children.splice(gridIndex, 1, ...groups)
}

export function applyObsidianBaseViews(root, basesData, allFiles = []) {
  if (!basesData || !Array.isArray(basesData.views)) {
    applyObsidianCardLayout(root)
    return
  }

  const filesBySlug = new Map(
    allFiles.filter((file) => typeof file?.slug === "string").map((file) => [file.slug, file]),
  )
  const views = descendants(root, (node) => hasClass(node, "bases-view"))
  for (const node of views) {
    const index = Number(node.properties.dataViewIndex ?? node.properties["data-view-index"])
    const view = basesData.views[index]
    if (!view || view.type !== "cards") continue

    addClass(node, "obsidian-bases-cards")
    if (finitePositive(view.cardSize)) node.properties.dataObsidianCardSize = String(view.cardSize)
    if (finitePositive(view.imageAspectRatio)) {
      node.properties.dataObsidianImageAspectRatio = String(view.imageAspectRatio)
    }
    node.properties.dataObsidianHasImage = String(typeof view.image === "string")
    node.properties.dataObsidianHideCover = String(view.hideCover === true)
    node.properties.dataObsidianImageFit = view.imageFit === "contain" ? "contain" : "cover"

    for (const grid of descendants(node, (candidate) => hasClass(candidate, "bases-cards"))) {
      groupCards(root, grid, view, filesBySlug)
    }
  }

  applyObsidianCardLayout(root)
}

export function applyObsidianCardLayout(root) {
  visit(root, "element", (wrapper) => {
    if (!hasClass(wrapper, "obsidian-bases-cards")) return

    const cardSize = finitePositive(wrapper.properties.dataObsidianCardSize)
    const obsidianImageRatio = finitePositive(wrapper.properties.dataObsidianImageAspectRatio)
    const cssImageRatio = obsidianImageRatio ? 1 / obsidianImageRatio : undefined
    const hasImage = wrapper.properties.dataObsidianHasImage === "true"
    const hideCover = wrapper.properties.dataObsidianHideCover === "true"
    const imageFit = wrapper.properties.dataObsidianImageFit === "contain" ? "contain" : "cover"

    for (const grid of descendants(wrapper, (node) => hasClass(node, "bases-cards"))) {
      grid.properties.style = mergeStyle(grid.properties.style, {
        ...(cardSize
          ? {
              "grid-template-columns": `repeat(auto-fill, minmax(min(${cardSize}px, 100%), ${cardSize}px))`,
            }
          : {}),
        "align-items": "start",
        "justify-content": "start",
        gap: "10px",
      })
    }

    for (const card of descendants(wrapper, (node) => hasClass(node, "bases-card"))) {
      card.properties.style = mergeStyle(card.properties.style, {
        width: "100%",
        "min-width": "0",
        "align-self": "start",
        "border-radius": "6px",
        "box-shadow": "none",
      })

      const directImages = card.children.filter(
        (child) => child.type === "element" && hasClass(child, "bases-card-image"),
      )
      if (hideCover) {
        card.children = card.children.filter((child) => !directImages.includes(child))
      } else if (hasImage) {
        if (cssImageRatio) {
          for (const image of directImages) {
            image.properties.style = mergeStyle(image.properties.style, {
              "aspect-ratio": String(cssImageRatio),
            })
          }
        }
        for (const image of directImages) {
          image.properties.style = mergeStyle(image.properties.style, {
            width: "calc(100% + 2px)",
            margin: "-1px -1px 0",
            padding: "0",
            "line-height": "0",
            background: "transparent",
          })
          for (const element of descendants(image, (node) => node.tagName === "img")) {
            element.properties.style = mergeStyle(element.properties.style, {
              "object-fit": imageFit,
              width: "100%",
              height: "100%",
              "max-width": "none",
              display: "block",
              margin: "0",
              "border-radius": "0",
            })
          }
        }
      }

      for (const body of descendants(card, (node) => hasClass(node, "bases-card-body"))) {
        body.properties.style = mergeStyle(body.properties.style, {
          padding: "6px 8px",
          "min-width": "0",
        })
      }
      for (const title of descendants(card, (node) => hasClass(node, "bases-card-title"))) {
        title.properties.title = textContent(title)
        title.properties.style = mergeStyle(title.properties.style, {
          display: "block",
          "min-width": "0",
          overflow: "hidden",
          "text-overflow": "ellipsis",
          "white-space": "nowrap",
        })
      }
    }
  })
}

export function BasesViewNameResolver() {
  return {
    name: "BasesViewNameResolver",
    htmlPlugins(ctx) {
      const baseFileBySlug = buildBaseFileLookup(ctx.allFiles)

      return [
        () => (tree, file) => {
          visit(tree, "element", (node, index, parent) => {
            if (node.tagName !== "blockquote") return
            if (node.properties?.dataBasesViewResolved === "true") return

            const classes = node.properties?.className ?? []
            if (!classes.includes("transclude")) return

            const dataUrl = node.properties?.dataUrl
            const dataBlock = node.properties?.dataBlock
            if (typeof dataUrl !== "string" || typeof dataBlock !== "string") return
            if (!dataBlock.startsWith("#") || dataBlock.startsWith("#^")) return

            const baseFile = baseFileBySlug.get(dataUrl)
            if (!baseFile) return

            let rawBase
            try {
              rawBase = readFileSync(join(ctx.argv.directory, baseFile), "utf8")
            } catch {
              return
            }

            const view = resolveBaseView(dataBlock.slice(1), rawBase)
            if (!view) return

            let basesData
            try {
              basesData = parse(rawBase)
            } catch {
              return
            }
            if (!basesData || !Array.isArray(basesData.views)) return

            if (!Array.isArray(file.data.basesBlocks)) file.data.basesBlocks = []
            const blockIndex = file.data.basesBlocks.length
            file.data.basesBlocks.push(basesData)

            const placeholder = {
              type: "element",
              tagName: "div",
              properties: {
                dataQzBasesCodeblock: String(blockIndex),
                dataQzBasesView: view.name,
              },
              children: [],
            }

            if (!parent || typeof index !== "number") return
            if (view.type !== "cards") {
              parent.children[index] = placeholder
              return SKIP
            }

            parent.children[index] = {
              type: "element",
              tagName: "div",
              properties: {
                className: ["obsidian-bases-cards"],
                ...(finitePositive(view.cardSize)
                  ? { dataObsidianCardSize: String(view.cardSize) }
                  : {}),
                ...(finitePositive(view.imageAspectRatio)
                  ? { dataObsidianImageAspectRatio: String(view.imageAspectRatio) }
                  : {}),
                dataObsidianHasImage: String(typeof view.image === "string"),
                dataObsidianHideCover: String(view.hideCover === true),
              },
              children: [placeholder],
            }
            return SKIP
          })
        },
      ]
    },
  }
}

export function configureObsidianBasesPage(root, _slug, componentData) {
  const fileData = componentData?.fileData
  if (fileData?.basesData && Array.isArray(fileData.basesData.views)) {
    const options = fileData.basesOptions ?? {}
    fileData.basesOptions = {
      ...options,
      defaultViewType: options.defaultViewType ?? fileData.basesData.views[0]?.type,
      customViews: {
        ...(options.customViews ?? {}),
        cards: ObsidianCardsView,
        "mx-media-lib": ObsidianCardsView,
      },
    }
  }
  applyObsidianCardLayout(root)
}

export function ObsidianBasesCardsPageType() {
  return {
    name: "ObsidianBasesCards",
    priority: 0,
    match: () => false,
    layout: "default",
    body: () => () => null,
    treeTransforms() {
      return [configureObsidianBasesPage]
    },
  }
}
