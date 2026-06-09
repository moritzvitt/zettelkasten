import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import YAML from "yaml"

const vaultRoot = "/Users/moritzvitt/Notes/Obsidian Notes"
const zettelRoot = process.env.ZETTEL_SOURCE_ROOT || path.join(vaultRoot, "LLM Wiki/notes/zettel")
const languageLearningRoot = path.join(zettelRoot, "Immersion und Spracherwerb")
const homepageSource = path.join(
  vaultRoot,
  "LLM Wiki/notes/zettel/Willkommen in meinem Zettelkasten!.md",
)
const contentRoot = path.join(process.cwd(), "content")
const staticRoot = path.join(process.cwd(), "quartz/static")
const relationNames = ["Prev", "Next", "Parent", "Child", "Friend"]
const relationTypes = {
  Prev: "prev",
  Next: "next",
  Parent: "parent",
  Child: "child",
  Friend: "friend",
}

try {
  await access(zettelRoot)
} catch {
  console.log(`Zettel source not found at ${zettelRoot}; using existing content directory`)
  process.exit(0)
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(full)
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
  if (file === homepageSource) return path.basename(file)
  if (file.startsWith(`${languageLearningRoot}${path.sep}`)) {
    return path.relative(languageLearningRoot, file)
  }
  return path.relative(zettelRoot, file)
}

function titleFrom(file, text) {
  const h1 = text.match(/^#\s+(.+)$/m)
  return (h1?.[1] || path.basename(file, ".md")).trim()
}

function cleanTitle(value) {
  return value
    .replace(/^LLM Wiki\/workspace\/bin\//, "")
    .replace(/^LLM Wiki\/notes\/zettel\//, "")
    .replace(/\.md$/, "")
    .split("/")
    .pop()
    .trim()
}

function wikiLinks(text) {
  const result = []
  const rx = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g
  for (const match of text.matchAll(rx)) result.push(cleanTitle(match[1]))
  return result
}

function relations(text) {
  const rels = Object.fromEntries(relationNames.map((name) => [name, []]))
  for (const name of relationNames) {
    const rx = new RegExp(`^\\s*${name}::([^\\n]*)`, "gim")
    for (const match of text.matchAll(rx)) rels[name].push(...wikiLinks(match[1]))
    rels[name] = [...new Set(rels[name].filter(Boolean))]
  }
  return rels
}

function allWikiLinks(text) {
  return [...new Set(wikiLinks(text))]
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
}

function frontmatter(title, sourcePath, graphLinks = [], aliases = []) {
  const lines = [
    "---",
    `title: "${title.replaceAll('"', '\\"')}"`,
    `source: "${sourcePath.replaceAll('"', '\\"')}"`,
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

function addBrainEdge(edges, edgeKeys, from, to, type, explicit = true) {
  if (!from || !to || from === to) return
  const key = `${from}\u0000${to}\u0000${type}`
  if (edgeKeys.has(key)) return
  edgeKeys.add(key)
  edges.push({ from, to, type, explicit })
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
  const explicitKeys = new Set()
  const allKeys = new Set()

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
        addBrainEdge(explicitEdges, explicitKeys, from, to, type, true)
        addBrainEdge(allEdges, allKeys, from, to, type, true)
        addBrainEdge(allEdges, allKeys, to, from, mirrorType(type), false)
      }
    }
  }

  const childrenByParent = new Map()
  for (const edge of allEdges) {
    if (edge.type !== "child") continue
    if (!childrenByParent.has(edge.from)) childrenByParent.set(edge.from, new Set())
    childrenByParent.get(edge.from).add(edge.to)
  }

  for (const siblings of childrenByParent.values()) {
    const values = [...siblings]
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        addBrainEdge(allEdges, allKeys, values[i], values[j], "sibling", false)
        addBrainEdge(allEdges, allKeys, values[j], values[i], "sibling", false)
      }
    }
  }

  return {
    relationTypes: ["parent", "child", "prev", "next", "friend", "sibling"],
    nodes,
    edges: allEdges,
    explicitEdges,
  }
}

await rm(contentRoot, { recursive: true, force: true })
await mkdir(contentRoot, { recursive: true })

const files = await walk(zettelRoot)
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
  rawNotes.push({
    file,
    rel,
    relDir: path.dirname(rel) === "." ? "" : path.dirname(rel),
    title: titleFrom(file, text),
    text,
    relations: relations(text),
    wikiLinks: allWikiLinks(text),
    excerpt: excerpt(text),
  })
}

const graphPath = (note) => slugPath(note.rel)
const titleToPath = new Map(rawNotes.map((note) => [cleanTitle(note.title), graphPath(note)]))
const stemToPath = new Map(
  rawNotes.map((note) => [cleanTitle(path.basename(note.rel, ".md")), graphPath(note)]),
)
const resolve = (target) =>
  titleToPath.get(cleanTitle(target)) || stemToPath.get(cleanTitle(target)) || null

for (const note of rawNotes) {
  for (const name of relationNames)
    note.relations[name] = [...new Set(note.relations[name].map(resolve).filter(Boolean))]
  note.wikiLinks = [...new Set(note.wikiLinks.map(resolve).filter(Boolean))]
}

for (const note of rawNotes) {
  const out = path.join(contentRoot, note.rel)
  await mkdir(path.dirname(out), { recursive: true })
  const body = stripFrontmatter(note.text)
  const sourcePath = path.relative(vaultRoot, note.file)
  const graphLinks = [
    ...new Set(relationNames.flatMap((name) => note.relations[name]).filter(Boolean)),
  ]
  const aliases = note.file === homepageSource ? ["index"] : []
  await writeFile(
    out,
    frontmatter(note.title, sourcePath, graphLinks, aliases) + body.trim() + "\n",
  )
}

const folders = new Map()
for (const note of rawNotes) {
  if (!folders.has(note.relDir)) folders.set(note.relDir, [])
  folders.get(note.relDir).push(note)
}

for (const [relDir, notes] of folders) {
  if (!relDir) continue
  const out = path.join(contentRoot, relDir, "index.md")
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

console.log(`Synced ${rawNotes.length} zettel notes into ${contentRoot}`)
if (skipped) console.log(`Skipped ${skipped} unpublished or draft notes`)
