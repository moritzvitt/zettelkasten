import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import YAML from "yaml"

const vaultRoot = "/Users/moritzvitt/Notes/Obsidian Notes"
const zettelRoot = process.env.ZETTEL_SOURCE_ROOT || path.join(vaultRoot, "LLM Wiki/notes/zettel")
const contentRoot = path.join(process.cwd(), "content")
const relationNames = ["Prev", "Next", "Parent", "Child", "Friend"]
const publishMode = process.env.PUBLISH_MODE || "curated"

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
  if (publishMode === "explicit") return isTruthy(data.publish) || isTruthy(data["dg-publish"])
  return true
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
    const rx = new RegExp(`${name}::([^\\n%]*)`, "gi")
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

function frontmatter(title, sourcePath, graphLinks = []) {
  const lines = [
    "---",
    `title: "${title.replaceAll('"', '\\"')}"`,
    `source: "${sourcePath.replaceAll('"', '\\"')}"`,
    "publish: true",
  ]
  if (graphLinks.length) {
    lines.push("graphLinks:")
    for (const link of graphLinks) lines.push(`  - "[[${link.replaceAll('"', '\\"')}]]"`)
  }
  lines.push("tags:", "  - zettel", "---", "")
  return lines.join("\n")
}

function folderIndex(relDir, notes) {
  const title = relDir ? relDir.split(path.sep).at(-1) : "Zettelkasten"
  return [
    frontmatter(title, relDir || "LLM Wiki/notes/zettel"),
    `# ${title}`,
    "",
    relDir
      ? "Diese Seite sammelt die Zettel aus diesem Themenbereich."
      : "Dies ist die Quartz-Version des Zettelkastens aus `LLM Wiki/notes/zettel`.",
    "",
    "## Notizen",
    "",
    ...notes.map((note) => `- [[${note.title}]] - ${note.excerpt}`),
    "",
  ].join("\n")
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
  const rel = path.relative(zettelRoot, file)
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

const titleToTitle = new Map(rawNotes.map((note) => [cleanTitle(note.title), note.title]))
const stemToTitle = new Map(
  rawNotes.map((note) => [cleanTitle(path.basename(note.rel, ".md")), note.title]),
)
const resolve = (target) =>
  titleToTitle.get(cleanTitle(target)) || stemToTitle.get(cleanTitle(target)) || null

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
  await writeFile(out, frontmatter(note.title, sourcePath, graphLinks) + body.trim() + "\n")
}

const folders = new Map()
for (const note of rawNotes) {
  if (!folders.has(note.relDir)) folders.set(note.relDir, [])
  folders.get(note.relDir).push(note)
}

await writeFile(
  path.join(contentRoot, "index.md"),
  folderIndex(
    "",
    rawNotes.sort((a, b) => a.title.localeCompare(b.title, "de")),
  ),
)

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

console.log(`Synced ${rawNotes.length} zettel notes into ${contentRoot}`)
if (skipped) console.log(`Skipped ${skipped} unpublished or draft notes`)
