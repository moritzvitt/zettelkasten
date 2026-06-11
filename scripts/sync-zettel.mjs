import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import YAML from "yaml"
import {
  parseLinksSection,
  relationshipNames,
  relationshipTypes,
  withInverseRelationships,
} from "./relationship-parser.mjs"

const vaultRoot = "/Users/moritzvitt/Notes/Obsidian Notes"
const digitalGardenRoot =
  process.env.ZETTEL_SOURCE_ROOT ||
  process.env.DIGITAL_GARDEN_ROOT ||
  path.join(vaultRoot, "Digital Garden")
const homepageSource = path.join(
  vaultRoot,
  "Digital Garden/Zettelkasten/zettel/Willkommen in meinem Zettelkasten!.md",
)
const contentRoot = path.join(process.cwd(), "content")
const staticRoot = path.join(process.cwd(), "quartz/static")
const relationNames = relationshipNames
const relationTypes = relationshipTypes

try {
  await access(digitalGardenRoot)
} catch {
  console.log(`Digital Garden source not found at ${digitalGardenRoot}; using existing content directory`)
  process.exit(0)
}

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walkFiles(full)))
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

function customOutputPath(file, data) {
  const customPath = data["custom-path"]
  if (typeof customPath !== "string" || !customPath.trim()) return null

  const normalized = customPath.trim().replaceAll("\\", "/").replace(/^\/+/, "")
  const target = normalized.endsWith(".md")
    ? normalized
    : path.posix.join(normalized, path.basename(file))
  const safeTarget = path.posix.normalize(target)
  if (safeTarget === "." || safeTarget.startsWith("../") || safeTarget === "..") {
    throw new Error(`Invalid custom-path for ${file}: ${customPath}`)
  }
  return safeTarget
}

function outputPath(file, data) {
  const customPath = customOutputPath(file, data)
  if (customPath) return customPath
  return path.relative(digitalGardenRoot, file)
}

function titleFrom(file, text) {
  const h1 = text.match(/^#\s+(.+)$/m)
  return (h1?.[1] || path.basename(file, ".md")).trim()
}

function cleanTitle(value) {
  return value
    .replace(/^LLM Wiki\/workspace\/bin\//, "")
    .replace(/^LLM Wiki\/notes\/zettel\//, "")
    .replace(/^Digital Garden\/Zettelkasten\/zettel\//, "")
    .replace(/^Digital Garden\//, "")
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

const embeddableAssetExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"])

function embeddedAssets(text) {
  const result = []
  const rx = /!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g
  for (const match of text.matchAll(rx)) {
    const target = match[1].trim()
    if (embeddableAssetExtensions.has(path.extname(target).toLocaleLowerCase("de"))) {
      result.push(target)
    }
  }
  return [...new Set(result)]
}

function excerpt(text) {
  return stripFrontmatter(text)
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
      if (embed) return match
      const slug = resolve(note, target)
      if (!slug) return match
      return `[[${slug}${anchor}|${label || cleanTitle(target)}]]`
    },
  )
}

const passthroughFrontmatterKeys = [
  "mx-uid",
  "media",
  "captions",
  "language",
  "offset",
  "source_offset_applied",
  "cover",
]

function yamlField(key, value) {
  return YAML.stringify({ [key]: value }).trimEnd().split("\n")
}

function passthroughFrontmatter(data) {
  return Object.fromEntries(
    passthroughFrontmatterKeys
      .filter((key) => data[key] !== undefined)
      .map((key) => [key, data[key]]),
  )
}

function frontmatter(title, sourcePath, graphLinks = [], aliases = [], extraData = {}) {
  const lines = [
    "---",
    `title: "${title.replaceAll('"', '\\"')}"`,
    `source: "${sourcePath.replaceAll('"', '\\"')}"`,
    ...Object.entries(extraData).flatMap(([key, value]) => yamlField(key, value)),
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
  lines.push("tags:", "  - zettel", "---", "")
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
    ...notes.map((note) => `- [[${note.title}]] - ${note.excerpt}`),
    "",
  ].join("\n")
}

function slugSegment(value) {
  return value.trim().toLocaleLowerCase("de").replace(/\s+/g, "-")
}

function slugPath(value) {
  return value
    .replace(/\.md$/, "")
    .split(path.sep)
    .filter(Boolean)
    .map(slugSegment)
    .join("/")
}

function mergeDirection(current, incoming) {
  if (!current) return incoming
  if (!incoming || current === incoming) return current
  return "both"
}

function addBrainEdge(
  edges,
  edgeMap,
  from,
  to,
  type,
  explicit = true,
  direction = "from",
  via,
) {
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
      tags: ["zettel"],
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

const sourceFiles = await walkFiles(digitalGardenRoot)
const files = sourceFiles.filter((file) => file.endsWith(".md"))
const assetsByName = new Map()
for (const file of sourceFiles) {
  const ext = path.extname(file).toLocaleLowerCase("de")
  if (!embeddableAssetExtensions.has(ext)) continue
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
  const rel = outputPath(file, data)
  const parsedRelationships = parseLinksSection(text)
  rawNotes.push({
    file,
    rel,
    relDir: path.dirname(rel) === "." ? "" : path.dirname(rel),
    title: titleFrom(file, text),
    text,
    relations: parsedRelationships.byType,
    relationships: parsedRelationships.relationships,
    wikiLinks: allWikiLinks(text),
    embeddedAssets: embeddedAssets(text),
    excerpt: excerpt(text),
    frontmatter: data,
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
const resolve = (note, target) => {
  if (target.includes("/")) {
    const explicitSlug = slugPath(cleanTargetPath(target))
    if (slugSet.has(explicitSlug)) return explicitSlug
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
  const body = rewriteWikiLinks(stripFrontmatter(note.text), note, resolve)
  const sourcePath = path.relative(vaultRoot, note.file)
  const graphLinks = [
    ...new Set(relationNames.flatMap((name) => note.relations[name]).filter(Boolean)),
  ]
  const aliases = note.file === homepageSource ? ["index"] : []
  await writeFile(
    out,
    frontmatter(
      note.title,
      sourcePath,
      graphLinks,
      aliases,
      passthroughFrontmatter(note.frontmatter),
    ) + body.trim() + "\n",
  )
}

for (const note of rawNotes) {
  for (const target of note.embeddedAssets) {
    const source = assetsByName.get(path.basename(target))
    if (!source) {
      console.warn(`Missing embedded asset ${target} referenced by ${path.relative(vaultRoot, note.file)}`)
      continue
    }
    const destination = path.join(contentRoot, note.relDir, path.basename(target))
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(source, destination)
  }
}

const folders = new Map()
for (const note of rawNotes) {
  if (!folders.has(note.relDir)) folders.set(note.relDir, [])
  folders.get(note.relDir).push(note)
}

for (const [relDir, notes] of folders) {
  if (!relDir) continue
  const out = path.join(contentRoot, relDir, "index.md")
  if (rawNotes.some((note) => note.rel === path.join(relDir, "index.md"))) continue
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
    console.warn(
      `- ${relationship.source} --${relationship.type}--> ${relationship.target}`,
    )
  }
}
