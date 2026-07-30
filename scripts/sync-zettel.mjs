import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"
import {
  parseLinksSection,
  relationshipNames,
  relationshipTypes,
  withInverseRelationships,
} from "./relationship-parser.mjs"
import { assetHref } from "./asset-path.mjs"
import { renderPdfEmbed } from "./pdf-embed.mjs"

const defaultVaultRoot = "/Users/moritzvitt/Notes/Obsidian Notes"
const vaultRoot =
  process.env.ZETTEL_SOURCE_ROOT || process.env.DIGITAL_GARDEN_ROOT || defaultVaultRoot
const nestedDigitalGardenRoot = path.join(vaultRoot, "Digital Garden")
const hasNestedDigitalGarden = existsSync(nestedDigitalGardenRoot)
const digitalGardenRoot = hasNestedDigitalGarden ? nestedDigitalGardenRoot : vaultRoot
const picturesRoot = process.env.ZETTEL_PICTURES_ROOT || path.join("/Users/moritzvitt", "Pictures")
const moviesRoot = process.env.ZETTEL_MOVIES_ROOT || path.join("/Users/moritzvitt", "Movies")
const transcriptsRoot = process.env.ZETTEL_TRANSCRIPTS_ROOT || path.join(moviesRoot, "Transkripte")
const homepageSources = [
  path.join(digitalGardenRoot, "Digital Garden.md"),
  path.join(digitalGardenRoot, "Welcome in my Digital Garden!.md"),
  path.join(digitalGardenRoot, "Tea Garden", "Welcome in my Digital Garden!.md"),
]
const contentRoot = path.join(process.cwd(), "content")
const staticRoot = path.join(process.cwd(), "quartz/static")
const excalidrawStaticRoot = path.join(staticRoot, "excalidraw")
const relationNames = relationshipNames
const relationTypes = relationshipTypes

try {
  await access(vaultRoot)
} catch {
  console.log(`Obsidian source not found at ${vaultRoot}; using existing content directory`)
  process.exit(0)
}

const ignoredSourceDirectories = new Set([".git", ".obsidian", ".trash", "node_modules"])

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && !ignoredSourceDirectories.has(entry.name)) {
      files.push(...(await walkFiles(full)))
    }
    if (entry.isFile()) files.push(full)
  }
  return files
}

function stripFrontmatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n?/, "")
}

function frontmatterData(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return {}
  try {
    return YAML.parse(match[1]) || {}
  } catch {
    return {}
  }
}

function isTruthy(value) {
  return value === true || value === "true" || value === "yes" || value === 1
}

function isFalsey(value) {
  return value === false || value === "false" || value === "no" || value === 0
}

function shouldPublish(data) {
  if (isTruthy(data.draft) || isFalsey(data.publish) || isFalsey(data["dg-publish"])) return false
  return isTruthy(data.publish) || isTruthy(data["dg-publish"])
}

function outputPath(file) {
  if (isHomepageSource(file)) return "index.md"
  const relative = path.relative(vaultRoot, file)
  if (!hasNestedDigitalGarden) return relative

  const gardenPrefix = `Digital Garden${path.sep}`
  return relative.startsWith(gardenPrefix) ? relative.slice(gardenPrefix.length) : relative
}

function isHomepageSource(file) {
  return homepageSources.some((source) => path.resolve(file) === path.resolve(source))
}

function titleFrom(file, text) {
  const data = frontmatterData(text)
  if (data["excalidraw-plugin"]) {
    return path
      .basename(file, ".md")
      .replace(/\.excalidraw(?:\s+\d+)?$/i, "")
      .trim()
  }

  const h1 = text.match(/^#\s+(.+)$/m)
  return (h1?.[1] || path.basename(file, ".md")).trim()
}

function cleanTitle(value) {
  return value
    .replace(/^LLM Wiki\/workspace\/bin\//, "")
    .replace(/^LLM Wiki\/notes\/zettel\//, "")
    .replace(/^Digital Garden\/Zettelkasten\/zettel\//, "")
    .replace(/^Digital Garden\//, "")
    .replace(/\.excalidraw\.svg$/i, "")
    .replace(/\.excalidraw\.md$/i, "")
    .replace(/\.md$/, "")
    .split("/")
    .pop()
    .trim()
}

function cleanTargetPath(value) {
  return value
    .replace(/^LLM Wiki\/workspace\/bin\//, "")
    .replace(/^LLM Wiki\/notes\/zettel\//, "")
    .replace(/^Digital Garden\//, "")
    .replace(/\.md$/, "")
}

function wikiLinks(text) {
  const result = []
  const rx = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g
  for (const match of text.matchAll(rx)) result.push(cleanTitle(match[1]))
  return result
}

function allWikiLinks(text) {
  return [...new Set(wikiLinks(text))]
}

const imageAssetExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"])
const pdfAssetExtensions = new Set([".pdf"])
const videoAssetExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".ogv"])
const copiedAssetExtensions = new Set([
  ...imageAssetExtensions,
  ...pdfAssetExtensions,
  ...videoAssetExtensions,
])

function embeddedAssets(text) {
  const result = []
  const rx = /!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g
  for (const match of text.matchAll(rx)) {
    const target = match[1].trim()
    if (copiedAssetExtensions.has(path.extname(target).toLocaleLowerCase("de"))) {
      result.push(target)
    }
  }
  return [...new Set(result)]
}

function wikilinkImageTarget(value) {
  if (typeof value !== "string") return null
  const match = value.match(/^!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/)
  if (!match) return null

  const target = match[1].trim()
  return imageAssetExtensions.has(path.extname(target).toLocaleLowerCase("de")) ? target : null
}

function publishedAssetPath(relDir, target) {
  return [...relDir.split(path.sep).filter(Boolean), path.basename(target)].join("/")
}

function localFile(value) {
  if (typeof value !== "string" || !value.startsWith("file:")) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "file:") return null
    return fileURLToPath(url)
  } catch {
    return null
  }
}

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function publishablePicture(value) {
  const source = localFile(value)
  if (!source || !isInside(picturesRoot, source)) return null
  if (!imageAssetExtensions.has(path.extname(source).toLocaleLowerCase("de"))) return null
  return source
}

function isPrivateTranscript(value) {
  const source = localFile(value)
  if (!source) return false
  const ext = path.extname(source).toLocaleLowerCase("de")
  return isInside(transcriptsRoot, source) || ext === ".srt" || ext === ".vtt"
}

function withoutLocalFileUrls(value) {
  if (Array.isArray(value)) {
    return value.map(withoutLocalFileUrls).filter((item) => item !== undefined)
  }
  if (typeof value === "string" && localFile(value)) return undefined
  return value
}

function publicFrontmatter(data) {
  const result = {}
  for (const [key, value] of Object.entries(data)) {
    if (key === "captions") continue
    const publicValue = withoutLocalFileUrls(value)
    if (publicValue === undefined) continue
    if (Array.isArray(publicValue) && publicValue.length === 0 && Array.isArray(value)) {
      result[key] = publicValue
      continue
    }
    result[key] = publicValue
  }
  return result
}

function rewriteExternalFileUrls(text, externalAssets) {
  const markdownFileLink = /(!?)\[([^\]]*)\]\((file:\/\/\/[^)\s]+)(?:\s+["'][^)]*["'])?\)/g
  const rewritten = text.replace(markdownFileLink, (match, embed, label, value) => {
    const picture = publishablePicture(value)
    if (embed && picture) {
      externalAssets.set(picture, path.basename(picture))
      return `![${label}](./${encodeURIComponent(path.basename(picture))})`
    }

    if (embed) return label ? `*${label} – nicht öffentlich verfügbar*` : ""
    if (isPrivateTranscript(value) && /transcript|transkript|untertitel/i.test(label)) {
      return `${label} (nicht öffentlich verfügbar)`
    }
    return label
  })

  return rewritten.replace(/file:\/\/\/[^\s)<>"']+/g, "")
}

function excerpt(text) {
  return stripFrontmatter(text)
    .replace(/!?\[([^\]]*)\]\((file:\/\/\/[^)\s]+)(?:\s+["'][^)]*["'])?\)/g, (_, label) => label)
    .replace(/file:\/\/\/[^\s)<>"']+/g, "")
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(
      /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,
      (_, target, label) => label || cleanTitle(target),
    )
    .replace(/^#+\s+/gm, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !relationNames.some((name) => line.startsWith(`${name}::`)))
    .join(" ")
    .slice(0, 220)
    .trimEnd()
}

function rewriteWikiLinks(text, note, resolve) {
  return text.replace(
    /(!?)\[\[([^\]|#]+)(#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,
    (match, embed, target, anchor = "", label) => {
      if (embed) {
        const ext = path.extname(target).toLocaleLowerCase("de")
        if (imageAssetExtensions.has(ext)) return match
        if (pdfAssetExtensions.has(ext) || videoAssetExtensions.has(ext)) {
          return renderAssetEmbed(target, label)
        }
      }
      const slug = resolve(note, target)
      if (!slug) return match
      return `${embed}[[${slug}${anchor}|${label || cleanTitle(target)}]]`
    },
  )
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function embedSize(label) {
  if (!label) return {}
  const value = label.trim()
  const match = value.match(/^(\d+)(?:x(\d+))?$/i)
  if (!match) return {}
  return {
    width: Number(match[1]),
    height: match[2] ? Number(match[2]) : undefined,
  }
}

function sizeStyle(size, defaults = {}) {
  const width = size.width ?? defaults.width
  const height = size.height ?? defaults.height
  const styles = []
  if (width) styles.push(`width: ${width}px`)
  if (height) styles.push(`height: ${height}px`)
  return styles.length ? ` style="${styles.join("; ")}"` : ""
}

function renderAssetEmbed(target, label) {
  const ext = path.extname(target).toLocaleLowerCase("de")
  const href = escapeHtml(assetHref(target))
  const title = escapeHtml(cleanTitle(target))
  const size = embedSize(label)

  if (pdfAssetExtensions.has(ext)) {
    return renderPdfEmbed({
      href,
      title,
      styleAttribute: sizeStyle(size, { height: 600 }),
    })
  }

  if (videoAssetExtensions.has(ext)) {
    const width = size.width ? ` width="${size.width}"` : ""
    const height = size.height ? ` height="${size.height}"` : ""
    return `<video controls playsinline preload="metadata" src="${href}"${width}${height} title="${title}"></video>`
  }

  return `![[${target}${label ? `|${label}` : ""}]]`
}

const passthroughFrontmatterKeys = [
  "next",
  "previous",
  "parents",
  "children",
  "mx-uid",
  "media",
  "captions",
  "language",
  "offset",
  "source_offset_applied",
  "cover",
  "tags",
  "vocab-trainer",
  "password",
  "unlisted",
  "stealth",
]

function yamlField(key, value) {
  return YAML.stringify({ [key]: value })
    .trimEnd()
    .split("\n")
}

function passthroughFrontmatter(data) {
  const passthrough = Object.fromEntries(
    passthroughFrontmatterKeys
      .filter((key) => data[key] !== undefined)
      .map((key) => [key, data[key]]),
  )

  if (
    passthrough["vocab-trainer"] === undefined &&
    String(data.plugin ?? "")
      .trim()
      .toLocaleLowerCase("de") === "vocab-trainer"
  ) {
    passthrough["vocab-trainer"] = true
  }

  return passthrough
}

function normalizeTags(value) {
  const values = Array.isArray(value) ? value.flat(Infinity) : value === undefined ? [] : [value]
  return [
    ...new Set(
      values
        .flatMap((tag) => String(tag).split(","))
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean),
    ),
  ]
}

function publishedTags(data = {}) {
  return [...new Set(["zettel", ...normalizeTags(data.tags)])]
}

function frontmatter(title, sourcePath, graphLinks = [], aliases = [], extraData = {}) {
  const { tags: sourceTags, ...extraFields } = extraData
  const lines = [
    "---",
    `title: "${title.replaceAll('"', '\\"')}"`,
    `source: "${sourcePath.replaceAll('"', '\\"')}"`,
    ...Object.entries(extraFields).flatMap(([key, value]) => yamlField(key, value)),
    "publish: true",
  ]
  if (aliases.length) {
    lines.push("aliases:")
    for (const alias of aliases) lines.push(`  - "${alias.replaceAll('"', '\\"')}"`)
  }
  if (graphLinks.length) {
    lines.push("graphLinks:")
    for (const link of graphLinks) lines.push(`  - "[[${link.replaceAll('"', '\\"')}]]"`)
  }
  lines.push("tags:")
  for (const tag of publishedTags({ tags: sourceTags }))
    lines.push(`  - ${YAML.stringify(tag).trim()}`)
  lines.push("---", "")
  return lines.join("\n")
}

function folderIndex(relDir, notes) {
  const title = relDir.split(path.sep).at(-1)
  return [
    frontmatter(title, relDir),
    `# ${title}`,
    "",
    "Diese Seite sammelt die Zettel aus diesem Themenbereich.",
    "",
    "## Notizen",
    "",
    ...notes.map((note) => `- [[${graphPath(note)}|${note.title}]] - ${note.excerpt}`),
    "",
  ].join("\n")
}

function slugSegment(value) {
  return value.trim().toLocaleLowerCase("de").replace(/\s+/g, "-")
}

function slugPath(value) {
  const segments = value.replace(/\.md$/, "").split(path.sep).filter(Boolean)

  const last = segments.at(-1)
  const parent = segments.at(-2)
  if (segments.length > 1 && last === parent && last !== "index") {
    segments[segments.length - 1] = "index"
  }

  return segments.map(slugSegment).join("/")
}

function mergeDirection(current, incoming) {
  if (!current) return incoming
  if (!incoming || current === incoming) return current
  return "both"
}

function addBrainEdge(edges, edgeMap, from, to, type, explicit = true, direction = "from", via) {
  if (!from || !to || from === to) return
  const key = `${from}\u0000${to}\u0000${type}`
  const existing = edgeMap.get(key)
  if (existing) {
    existing.explicit ||= explicit
    existing.direction = mergeDirection(existing.direction, direction)
    if (!existing.via && via) existing.via = via
    return
  }
  const edge = { from, to, type, explicit, direction }
  if (via) edge.via = via
  edgeMap.set(key, edge)
  edges.push(edge)
}

function mirrorType(type) {
  if (type === "parent") return "child"
  if (type === "child") return "parent"
  if (type === "prev") return "next"
  if (type === "next") return "prev"
  return type
}

function buildBrainIndex(notes) {
  const nodes = {}
  const explicitEdges = []
  const allEdges = []
  const explicitEdgesByKey = new Map()
  const allEdgesByKey = new Map()

  for (const note of notes) {
    const slug = graphPath(note)
    nodes[slug] = {
      slug,
      title: note.title,
      source: path.relative(vaultRoot, note.file),
      url: `/${slug}`,
      tags: publishedTags(note.frontmatter),
    }
  }

  for (const note of notes) {
    const from = graphPath(note)
    for (const name of relationNames) {
      const type = relationTypes[name]
      for (const to of note.relations[name]) {
        addBrainEdge(explicitEdges, explicitEdgesByKey, from, to, type, true, "from")
        addBrainEdge(allEdges, allEdgesByKey, from, to, type, true, "from")
        addBrainEdge(allEdges, allEdgesByKey, to, from, mirrorType(type), false, "to")
      }
    }
  }

  const childrenByParent = new Map()
  for (const edge of allEdges) {
    if (edge.type !== "child") continue
    if (!childrenByParent.has(edge.from)) childrenByParent.set(edge.from, new Set())
    childrenByParent.get(edge.from).add(edge.to)
  }

  for (const [parent, siblings] of childrenByParent.entries()) {
    const values = [...siblings]
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        addBrainEdge(
          allEdges,
          allEdgesByKey,
          values[i],
          values[j],
          "sibling",
          false,
          "none",
          parent,
        )
        addBrainEdge(
          allEdges,
          allEdgesByKey,
          values[j],
          values[i],
          "sibling",
          false,
          "none",
          parent,
        )
      }
    }
  }

  return {
    relationTypes: ["parent", "child", "prev", "next", "friend", "sibling"],
    nodes,
    relationships: withInverseRelationships(explicitEdges),
    edges: allEdges,
    explicitEdges,
  }
}

await rm(contentRoot, { recursive: true, force: true })
await mkdir(contentRoot, { recursive: true })
await rm(excalidrawStaticRoot, { recursive: true, force: true })
await mkdir(excalidrawStaticRoot, { recursive: true })

const sourceFiles = await walkFiles(vaultRoot)
const files = sourceFiles.filter((file) => file.endsWith(".md"))
const baseFiles = sourceFiles.filter(
  (file) => path.extname(file).toLocaleLowerCase("de") === ".base",
)
const assetsByName = new Map()
for (const file of sourceFiles) {
  const ext = path.extname(file).toLocaleLowerCase("de")
  if (!copiedAssetExtensions.has(ext)) continue
  const name = path.basename(file)
  if (!assetsByName.has(name)) assetsByName.set(name, file)
}

const rawNotes = []
let skipped = 0
for (const file of files) {
  const text = await readFile(file, "utf8")
  const data = frontmatterData(text)
  if (!shouldPublish(data)) {
    skipped += 1
    continue
  }
  const rel = outputPath(file)
  const relDir = path.dirname(rel) === "." ? "" : path.dirname(rel)
  const coverAsset = wikilinkImageTarget(data.cover)
  const externalCover = publishablePicture(data.cover)
  const externalAssets = new Map()
  if (externalCover) externalAssets.set(externalCover, path.basename(externalCover))
  const parsedRelationships = parseLinksSection(text)
  const publicData = publicFrontmatter(data)
  rawNotes.push({
    file,
    rel,
    relDir,
    title: titleFrom(file, text),
    text,
    relations: parsedRelationships.byType,
    relationships: parsedRelationships.relationships,
    wikiLinks: allWikiLinks(text),
    embeddedAssets: [...new Set([...embeddedAssets(text), ...(coverAsset ? [coverAsset] : [])])],
    externalAssets,
    excerpt: excerpt(text),
    frontmatter: coverAsset
      ? { ...publicData, cover: `[[${publishedAssetPath(relDir, coverAsset)}]]` }
      : externalCover
        ? { ...publicData, cover: `[[${publishedAssetPath(relDir, externalCover)}]]` }
        : publicData,
  })
}

const graphPath = (note) => slugPath(note.rel)
const languageGroup = (note) => {
  const segments = note.rel.split(path.sep)
  const translationIndex = segments.findIndex((segment) => segment === "Translations")
  return segments[translationIndex + 1] === "English" ? "en" : "default"
}
const notesByLanguage = new Map()
for (const note of rawNotes) {
  const group = languageGroup(note)
  if (!notesByLanguage.has(group)) notesByLanguage.set(group, [])
  notesByLanguage.get(group).push(note)
}
const lookupByLanguage = new Map(
  [...notesByLanguage].map(([group, notes]) => [
    group,
    {
      titleToPath: new Map(notes.map((note) => [cleanTitle(note.title), graphPath(note)])),
      stemToPath: new Map(
        notes.map((note) => [cleanTitle(path.basename(note.rel, ".md")), graphPath(note)]),
      ),
    },
  ]),
)
const slugSet = new Set(rawNotes.map((note) => graphPath(note)))
const folderIndexBySlug = new Map(
  rawNotes
    .filter((note) => note.relDir)
    .map((note) => [slugPath(note.relDir), slugPath(path.join(note.relDir, "index.md"))]),
)
const resolve = (note, target) => {
  if (target.includes("/")) {
    const explicitSlug = slugPath(cleanTargetPath(target))
    if (slugSet.has(explicitSlug)) return explicitSlug
    const folderIndexSlug = folderIndexBySlug.get(explicitSlug)
    if (folderIndexSlug) return folderIndexSlug
  }

  const lookup = lookupByLanguage.get(languageGroup(note))
  return (
    lookup?.titleToPath.get(cleanTitle(target)) ||
    lookup?.stemToPath.get(cleanTitle(target)) ||
    null
  )
}

for (const note of rawNotes) {
  const unresolved = []
  for (const name of relationNames) {
    const resolved = []
    for (const target of note.relations[name]) {
      const slug = resolve(note, target)
      if (slug) resolved.push(slug)
      else unresolved.push({ type: relationTypes[name], target })
    }
    note.relations[name] = [...new Set(resolved)]
  }
  note.unresolvedRelationships = unresolved
  note.wikiLinks = [
    ...new Set(note.wikiLinks.map((target) => resolve(note, target)).filter(Boolean)),
  ]
}

for (const note of rawNotes) {
  const out = path.join(contentRoot, note.rel)
  await mkdir(path.dirname(out), { recursive: true })
  const isExcalidraw = Boolean(note.frontmatter["excalidraw-plugin"])
  const body = rewriteExternalFileUrls(
    rewriteWikiLinks(stripFrontmatter(note.text), note, resolve),
    note.externalAssets,
  )
  const sourcePath = path.relative(vaultRoot, note.file)
  const graphLinks = [
    ...new Set(relationNames.flatMap((name) => note.relations[name]).filter(Boolean)),
  ]
  const output = isExcalidraw
    ? note.text.trimEnd() + "\n"
    : frontmatter(
        note.title,
        sourcePath,
        graphLinks,
        [],
        passthroughFrontmatter(note.frontmatter),
      ) +
      body.trim() +
      "\n"
  await writeFile(out, output)

  if (isExcalidraw) {
    const exportBase = note.file.replace(/\.md$/i, "")
    for (const mode of ["light", "dark"]) {
      const source = `${exportBase}.${mode}.svg`
      try {
        await access(source)
      } catch {
        continue
      }
      const destination = path.join(excalidrawStaticRoot, note.relDir, path.basename(source))
      await mkdir(path.dirname(destination), { recursive: true })
      await copyFile(source, destination)
    }
  }
}

for (const note of rawNotes) {
  for (const target of note.embeddedAssets) {
    const source = assetsByName.get(path.basename(target))
    if (!source) {
      console.warn(
        `Missing embedded asset ${target} referenced by ${path.relative(vaultRoot, note.file)}`,
      )
      continue
    }
    const destination = path.join(contentRoot, note.relDir, path.basename(target))
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(source, destination)
  }

  for (const [source, target] of note.externalAssets) {
    const destination = path.join(contentRoot, note.relDir, target)
    try {
      await access(source)
    } catch {
      console.warn(
        `Missing external picture ${source} referenced by ${path.relative(vaultRoot, note.file)}`,
      )
      continue
    }
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(source, destination)
  }
}

for (const file of baseFiles) {
  const out = path.join(contentRoot, outputPath(file))
  await mkdir(path.dirname(out), { recursive: true })
  await copyFile(file, out)
}

const folders = new Map()
for (const note of rawNotes) {
  if (!folders.has(note.relDir)) folders.set(note.relDir, [])
  folders.get(note.relDir).push(note)
}

for (const [relDir, notes] of folders) {
  if (!relDir) continue
  const out = path.join(contentRoot, relDir, "index.md")
  const folderLandingSlug = slugPath(path.join(relDir, "index.md"))
  if (rawNotes.some((note) => graphPath(note) === folderLandingSlug)) continue
  await mkdir(path.dirname(out), { recursive: true })
  await writeFile(
    out,
    folderIndex(
      relDir,
      notes.sort((a, b) => a.title.localeCompare(b.title, "de")),
    ),
  )
}

await mkdir(staticRoot, { recursive: true })
await writeFile(
  path.join(staticRoot, "brain-index.json"),
  `${JSON.stringify(buildBrainIndex(rawNotes), null, 2)}\n`,
)

console.log(`Synced ${rawNotes.length} published Digital Garden notes into ${contentRoot}`)
if (baseFiles.length) console.log(`Synced ${baseFiles.length} Digital Garden bases`)
if (skipped) console.log(`Skipped ${skipped} unpublished or draft notes`)
const unresolvedRelationships = rawNotes.flatMap((note) =>
  note.unresolvedRelationships.map((relationship) => ({
    source: note.title,
    ...relationship,
  })),
)
if (unresolvedRelationships.length) {
  console.warn(`Skipped ${unresolvedRelationships.length} unresolved relationships`)
  for (const relationship of unresolvedRelationships) {
    console.warn(`- ${relationship.source} --${relationship.type}--> ${relationship.target}`)
  }
}
