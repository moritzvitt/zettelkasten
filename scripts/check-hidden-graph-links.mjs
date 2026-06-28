import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import YAML from "yaml"

const vaultRoot = "/Users/moritzvitt/Notes/Obsidian Notes"
const digitalGardenRoot =
  process.env.ZETTEL_SOURCE_ROOT ||
  process.env.DIGITAL_GARDEN_ROOT ||
  path.join(vaultRoot, "Digital Garden")
const homepageSources = [
  path.join(digitalGardenRoot, "Welcome in my Digital Garden!.md"),
  path.join(digitalGardenRoot, "Tea Garden", "Welcome in my Digital Garden!.md"),
]
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

function outputPath(file) {
  if (isHomepageSource(file)) return "index.md"
  return path.relative(digitalGardenRoot, file)
}

function isHomepageSource(file) {
  return homepageSources.some((source) => path.resolve(file) === path.resolve(source))
}

function cleanTitle(value) {
  return value
    .replace(/^Digital Garden\/Zettelkasten\/zettel\//, "")
    .replace(/^Digital Garden\//, "")
    .replace(/\.md$/, "")
    .split("/")
    .pop()
    .trim()
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

function slugSegment(value) {
  return value.trim().toLocaleLowerCase("de").replace(/\s+/g, "-")
}

function slugPath(value) {
  const segments = value
    .replace(/\.md$/, "")
    .split(path.sep)
    .filter(Boolean)

  const last = segments.at(-1)
  const parent = segments.at(-2)
  if (segments.length > 1 && last === parent && last !== "index") {
    segments[segments.length - 1] = "index"
  }

  return segments
    .map(slugSegment)
    .join("/")
}

function languageGroup(note) {
  const segments = note.rel.split(path.sep)
  const translationIndex = segments.findIndex((segment) => segment === "Translations")
  return segments[translationIndex + 1] === "English" ? "en" : "default"
}

const sourceNotes = []
for (const file of await walk(digitalGardenRoot)) {
  const text = await readFile(file, "utf8")
  const data = frontmatter(text)
  if (!published(data)) continue
  const rel = outputPath(file)
  sourceNotes.push({ rel, slug: slugPath(rel), title: title(file, text), relations: hiddenRelations(text) })
}

const index = JSON.parse(await readFile(contentIndexPath, "utf8"))
const notesByLanguage = new Map()
for (const note of sourceNotes) {
  const group = languageGroup(note)
  if (!notesByLanguage.has(group)) notesByLanguage.set(group, [])
  notesByLanguage.get(group).push(note)
}
const lookupByLanguage = new Map(
  [...notesByLanguage].map(([group, notes]) => [
    group,
    {
      titleToPath: new Map(notes.map((note) => [cleanTitle(note.title), note.slug])),
      stemToPath: new Map(
        notes.map((note) => [cleanTitle(path.basename(note.rel, ".md")), note.slug]),
      ),
    },
  ]),
)
const resolve = (note, target) => {
  const lookup = lookupByLanguage.get(languageGroup(note))
  return (
    lookup?.titleToPath.get(cleanTitle(target)) ||
    lookup?.stemToPath.get(cleanTitle(target)) ||
    null
  )
}
const missing = []

for (const note of sourceNotes) {
  const graphLinks = new Set(index[note.slug]?.links || [])
  for (const target of note.relations) {
    const targetSlug = resolve(note, target)
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
