import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import YAML from "yaml"

const vaultRoot = "/Users/moritzvitt/Notes/Obsidian Notes"
const zettelRoot = process.env.ZETTEL_SOURCE_ROOT || path.join(vaultRoot, "LLM Wiki/notes/zettel")
const contentIndexPath = path.join(process.cwd(), "public/static/contentIndex.json")
const relationNames = ["Prev", "Next", "Parent", "Child", "Friend"]

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

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/)
  return match ? YAML.parse(match[1]) || {} : {}
}

function published(data) {
  return data.publish === true || data["dg-publish"] === true
}

function cleanTitle(value) {
  return value.replace(/\.md$/, "").split("/").pop().trim()
}

function title(file, text) {
  return (text.match(/^#\s+(.+)$/m)?.[1] || path.basename(file, ".md")).trim()
}

function hiddenRelations(text) {
  const hidden = [...text.matchAll(/%%([\s\S]*?)%%/g)].map((match) => match[1]).join("\n")
  const targets = []
  for (const name of relationNames) {
    const field = new RegExp(`${name}::([^\\n%]*)`, "gi")
    for (const match of hidden.matchAll(field)) {
      for (const link of match[1].matchAll(/\[\[([^\]|#]+)/g)) targets.push(cleanTitle(link[1]))
    }
  }
  return [...new Set(targets)]
}

const sourceNotes = []
for (const file of await walk(zettelRoot)) {
  const text = await readFile(file, "utf8")
  if (!published(frontmatter(text))) continue
  sourceNotes.push({ title: title(file, text), relations: hiddenRelations(text) })
}

const index = JSON.parse(await readFile(contentIndexPath, "utf8"))
const slugByTitle = new Map(Object.entries(index).map(([slug, note]) => [cleanTitle(note.title), slug]))
const missing = []

for (const note of sourceNotes) {
  const sourceSlug = slugByTitle.get(cleanTitle(note.title))
  if (!sourceSlug) continue
  const graphLinks = new Set(index[sourceSlug]?.links || [])
  for (const target of note.relations) {
    const targetSlug = slugByTitle.get(cleanTitle(target))
    if (targetSlug && !graphLinks.has(targetSlug)) {
      missing.push(`${note.title} -> ${target}`)
    }
  }
}

if (missing.length) {
  console.error(`Missing ${missing.length} published hidden graph links:\n${missing.join("\n")}`)
  process.exit(1)
}

console.log("All hidden relationships between published notes are present in the graph index")
