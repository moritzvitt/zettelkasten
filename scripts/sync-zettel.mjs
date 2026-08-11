import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { createHash } from "node:crypto"
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
import { learningClipsFromSources } from "../plugins/local-media-player/src/learning-clips.js"

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
const localMediaAliasManifest = path.join(process.cwd(), "private", "local-media-aliases.json")
const localMediaRoute = "/local-media"
const localMediaMarkerOrigin = "https://local-media.invalid"
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
  if (!hasNestedDigitalGarden) return relative.replaceAll('"', "")

  const gardenPrefix = `Digital Garden${path.sep}`
  const publicRelative = relative.startsWith(gardenPrefix)
    ? relative.slice(gardenPrefix.length)
    : relative
  return publicRelative.replaceAll('"', "")
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
const audioAssetExtensions = new Set([".mp3", ".wav", ".m4a", ".ogg", ".oga", ".aac", ".flac"])
const localMediaAssetExtensions = new Set([...videoAssetExtensions, ...audioAssetExtensions])
const localAliasAssetExtensions = new Set([...localMediaAssetExtensions, ...imageAssetExtensions])
const copiedAssetExtensions = new Set([
  ...imageAssetExtensions,
  ...pdfAssetExtensions,
  ...localMediaAssetExtensions,
])
const publishedEmbeddedAssetExtensions = new Set([...imageAssetExtensions, ...pdfAssetExtensions])

function embeddedAssets(text) {
  const result = []
  const rx = /!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g
  for (const match of text.matchAll(rx)) {
    const target = match[1].trim()
    if (publishedEmbeddedAssetExtensions.has(path.extname(target).toLocaleLowerCase("de"))) {
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

function wikilinkMediaTarget(value) {
  if (typeof value !== "string") return null
  const match = value.match(/^!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/)
  if (!match) return null

  const target = match[1].trim()
  return localMediaAssetExtensions.has(path.extname(target).toLocaleLowerCase("de")) ? target : null
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

function captionDescriptor(value, noteFile) {
  if (typeof value !== "string" || !value.trim()) return null
  let target = value.trim()
  const wikilink = target.match(/^\[\[([\s\S]*?)\]\]$/)
  if (wikilink) target = wikilink[1].split("|", 1)[0]

  const hashIndex = target.indexOf("#")
  const hash = hashIndex === -1 ? "" : target.slice(hashIndex + 1)
  const bareTarget = hashIndex === -1 ? target : target.slice(0, hashIndex)
  const metadata = new URLSearchParams(hash)
  let file
  try {
    const url = new URL(bareTarget)
    if (url.protocol !== "file:") return null
    file = fileURLToPath(url)
  } catch {
    try {
      file = path.resolve(path.dirname(noteFile), decodeURIComponent(bareTarget))
    } catch {
      file = path.resolve(path.dirname(noteFile), bareTarget)
    }
  }

  const extension = path.extname(file).toLocaleLowerCase("de")
  if ((extension !== ".srt" && extension !== ".vtt") || !existsSync(file)) return null
  return {
    file,
    language: metadata.get("lang")?.trim().toLocaleLowerCase("de") || "",
    label: metadata.get("label")?.trim().toLocaleLowerCase("de") || "",
  }
}

async function learningClipsForNote(noteFile, source, data) {
  const values = Array.isArray(data.captions)
    ? data.captions.flat(Infinity)
    : data.captions === undefined
      ? []
      : [data.captions]
  const captions = values.map((value) => captionDescriptor(value, noteFile)).filter(Boolean)
  if (!captions.length) return []

  const language = String(data.language ?? "")
    .trim()
    .toLocaleLowerCase("de")
  const caption =
    captions.find((candidate) => language && candidate.language === language) ||
    captions.find((candidate) => language && candidate.label.includes(language)) ||
    captions[0]
  try {
    return learningClipsFromSources(source, await readFile(caption.file, "utf8"))
  } catch {
    return []
  }
}

function localMediaFile(value) {
  const source = localFile(value)
  if (!source || !isInside(moviesRoot, source)) return null
  return localAliasAssetExtensions.has(path.extname(source).toLocaleLowerCase("de")) ? source : null
}

const localMediaAliases = new Map()

function localMediaAlias(source) {
  const extension = path.extname(source).toLocaleLowerCase("de")
  const digest = createHash("sha256").update(path.resolve(source)).digest("hex").slice(0, 24)
  const alias = `${localMediaRoute}/${digest}${extension}`
  localMediaAliases.set(alias, path.resolve(source))
  return alias
}

function localMediaAliasFromUrl(value) {
  const source = localMediaFile(value)
  if (!source) return null
  const url = new URL(value)
  return `${localMediaAlias(source)}${url.search}${url.hash}`
}

function localMediaPublishedHref(value) {
  const source = localMediaFile(value)
  if (!source) return null
  const url = new URL(value)
  const alias = localMediaAlias(source)
  const timestamp = url.hash.match(/^#t=?([0-9]+(?:\.[0-9]+)?)s?$/i)
  return timestamp
    ? localMediaTimestampHref(alias, `#t=${timestamp[1]}`)
    : `${alias}${url.search}${url.hash}`
}

function resolveWikilinkMedia(noteFile, target) {
  const direct = path.resolve(path.dirname(noteFile), target)
  if (existsSync(direct)) return direct
  return assetsByName.get(path.basename(target)) ?? null
}

function localMediaLabel(source) {
  const extension = path.extname(source).toLocaleLowerCase("de")
  if (imageAssetExtensions.has(extension)) return "Lokales Bild"
  return audioAssetExtensions.has(extension) ? "Lokales Audio" : "Lokales Video"
}

function safeLocalMediaLabel(label, source) {
  const fallback = localMediaLabel(source)
  if (!label) return fallback
  let decodedLabel = label
  try {
    decodedLabel = decodeURIComponent(label)
  } catch {}
  const originalName = path.basename(source, path.extname(source)).toLocaleLowerCase("de")
  return decodedLabel.toLocaleLowerCase("de").includes(originalName) ? fallback : label
}

function localMediaTimestampHref(alias, anchor = "") {
  const timestamp = anchor.match(/^#t=?([0-9]+(?:\.[0-9]+)?)s?$/i)
  if (!timestamp) return `${alias}${anchor}`
  return `${localMediaMarkerOrigin}/${encodeURIComponent(alias)}?t=${timestamp[1]}`
}

function withoutLocalFileUrls(value, noteFile) {
  if (Array.isArray(value)) {
    return value
      .map((item) => withoutLocalFileUrls(item, noteFile))
      .filter((item) => item !== undefined)
  }
  if (typeof value === "string" && localFile(value)) {
    return localMediaAliasFromUrl(value) ?? undefined
  }
  const mediaTarget = wikilinkMediaTarget(value)
  if (mediaTarget) {
    const source = resolveWikilinkMedia(noteFile, mediaTarget)
    return source ? localMediaAlias(source) : undefined
  }
  return value
}

function publicFrontmatter(data, noteFile) {
  const result = {}
  for (const [key, value] of Object.entries(data)) {
    if (key === "captions") continue
    const publicValue = withoutLocalFileUrls(value, noteFile)
    if (publicValue === undefined) continue
    if (Array.isArray(publicValue) && publicValue.length === 0 && Array.isArray(value)) {
      result[key] = publicValue
      continue
    }
    result[key] = publicValue
  }
  return result
}

function rewriteExternalFileUrls(text, externalAssets, noteFile) {
  const markdownFileLink =
    /(!?)\[([^\]\r\n]*)\]\((file:\/\/\/(?:[^()\s]+|\([^()\r\n]*\))+)(?:\s+["'][^)\r\n]*["'])?\)/g
  const rewritten = text.replace(markdownFileLink, (match, embed, label, value) => {
    const picture = publishablePicture(value)
    if (embed && picture) {
      externalAssets.set(picture, path.basename(picture))
      return `![${label}](./${encodeURIComponent(path.basename(picture))})`
    }

    const mediaHref = localMediaPublishedHref(value)
    if (mediaHref) {
      const source = localMediaFile(value)
      const safeLabel = safeLocalMediaLabel(label, source)
      return embed
        ? renderLocalMediaEmbed(source, mediaHref, label)
        : `[${safeLabel}](${mediaHref})`
    }

    if (embed) return label ? `*${label} – nicht öffentlich verfügbar*` : ""
    if (isPrivateTranscript(value) && /transcript|transkript|untertitel/i.test(label)) {
      return `${label} (nicht öffentlich verfügbar)`
    }
    return label
  })

  const withoutBareFileUrls = rewritten.replace(
    /file:\/\/\/[^\s)<>"']+/g,
    (value) => localMediaPublishedHref(value) ?? "",
  )

  return withoutBareFileUrls.replace(
    /(!?)\[([^\]\r\n]*)\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g,
    (match, embed, label, value) => {
      let decoded = value
      try {
        decoded = decodeURIComponent(value)
      } catch {}
      const withoutFragment = decoded.split(/[?#]/, 1)[0]
      const publishedExternalAsset = [...externalAssets.values()].includes(
        path.basename(withoutFragment),
      )
      if (publishedExternalAsset) return match
      const privateAbsolute = /^(?:\/Users\/|\/home\/|[A-Za-z]:[\\/])/.test(withoutFragment)
      const relativeFile = /^(?:\.\.?\/|[^/]+$)/.test(withoutFragment) && Boolean(path.extname(withoutFragment))
      const missingRelative =
        relativeFile && !existsSync(path.resolve(path.dirname(noteFile), withoutFragment))
      if (!privateAbsolute && !missingRelative) return match
      const safeLabel = label || cleanTitle(withoutFragment)
      return embed ? `*${safeLabel} – nicht öffentlich verfügbar*` : safeLabel
    },
  )
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
      const ext = path.extname(target).toLocaleLowerCase("de")
      if (localMediaAssetExtensions.has(ext)) {
        const source = resolveWikilinkMedia(note.file, target)
        const fallback = audioAssetExtensions.has(ext) ? "Lokales Audio" : "Lokales Video"
        if (!source)
          return label ? `${label} (${fallback.toLocaleLowerCase("de")} nicht verfügbar)` : fallback
        const alias = localMediaAlias(source)
        const safeLabel = safeLocalMediaLabel(label, source)
        if (!embed) return `[${safeLabel}](${localMediaTimestampHref(alias, anchor)})`

        return renderLocalMediaEmbed(source, alias, label)
      }
      if (embed) {
        if (imageAssetExtensions.has(ext)) {
          return resolveWikilinkMedia(note.file, target)
            ? match
            : `*${label || cleanTitle(target)} – nicht öffentlich verfügbar*`
        }
        if (pdfAssetExtensions.has(ext)) {
          return resolveWikilinkMedia(note.file, target)
            ? renderAssetEmbed(target, label)
            : `*${label || cleanTitle(target)} – nicht öffentlich verfügbar*`
        }
      }
      const slug = resolve(note, target)
      if (!slug) {
        const safeLabel = label || cleanTitle(target)
        return embed ? `*${safeLabel} – nicht öffentlich verfügbar*` : safeLabel
      }
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

function renderLocalMediaEmbed(source, href, label) {
  const size = embedSize(label)
  const width = size.width ? ` width="${size.width}"` : ""
  const height = size.height ? ` height="${size.height}"` : ""
  const escapedHref = escapeHtml(href)
  const title = localMediaLabel(source)
  const extension = path.extname(source).toLocaleLowerCase("de")
  if (imageAssetExtensions.has(extension)) {
    return `<img src="${escapedHref}" alt="${escapeHtml(safeLocalMediaLabel(label, source))}">`
  }
  if (audioAssetExtensions.has(extension)) {
    return `<audio controls preload="metadata" src="${escapedHref}" title="${title}"></audio>`
  }
  return `<video controls playsinline preload="metadata" src="${escapedHref}"${width}${height} title="${title}"></video>`
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

  if (audioAssetExtensions.has(ext)) {
    return `<audio controls preload="metadata" src="${href}" title="${title}"></audio>`
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
  "learningClips",
  "password",
  "unlisted",
  "stealth",
]

function baseFrontmatterKey(property) {
  if (typeof property !== "string") return undefined
  const parts = property.trim().split(".")
  if (parts[0] === "note") parts.shift()
  if (["file", "formula", "this"].includes(parts[0])) return undefined
  const key = parts[0]
  return key && !["title", "publish"].includes(key) ? key : undefined
}

const baseExpressionKeywords = new Set([
  "and",
  "or",
  "not",
  "true",
  "false",
  "null",
  "undefined",
  "note",
  "file",
  "formula",
  "this",
  "value",
])

function baseExpressionPropertyKeys(value) {
  const keys = new Set()
  if (Array.isArray(value)) {
    for (const item of value) {
      for (const key of baseExpressionPropertyKeys(item)) keys.add(key)
    }
    return keys
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      for (const key of baseExpressionPropertyKeys(item)) keys.add(key)
    }
    return keys
  }
  if (typeof value !== "string") return keys

  for (const match of value.matchAll(/\bnote\s*\[\s*(["'])([^"']+)\1\s*\]/g)) {
    const key = baseFrontmatterKey(match[2])
    if (key) keys.add(key)
  }
  for (const match of value.matchAll(/\bnote\.([A-Za-z_][\w-]*)/g)) {
    const key = baseFrontmatterKey(match[1])
    if (key) keys.add(key)
  }

  const unquoted = value.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, " ")
  for (const match of unquoted.matchAll(/\b([A-Za-z_][\w-]*)\b/g)) {
    const identifier = match[1]
    const before = unquoted.slice(0, match.index)
    const after = unquoted.slice(match.index + identifier.length)
    if (baseExpressionKeywords.has(identifier.toLowerCase())) continue
    if (/\.\s*$/.test(before) || /^\s*\(/.test(after)) continue
    const key = baseFrontmatterKey(identifier)
    if (key) keys.add(key)
  }
  return keys
}

function baseViewPropertyKeys(data) {
  const keys = new Set()
  for (const key of baseExpressionPropertyKeys(data?.filters)) keys.add(key)
  for (const key of baseExpressionPropertyKeys(data?.formulas)) keys.add(key)
  for (const view of Array.isArray(data?.views) ? data.views : []) {
    const properties = [
      ...(Array.isArray(view.order) ? view.order : []),
      ...(Array.isArray(view.sort) ? view.sort.map((entry) => entry?.property) : []),
      view.groupBy?.property,
      view.image,
      view.date,
      view.dateField,
      view.dateProperty,
      view.boardProperty,
      ...Object.keys(view.columnSize ?? {}),
      ...Object.keys(view.summaries ?? {}),
    ]
    for (const property of properties) {
      const key = baseFrontmatterKey(property)
      if (key) keys.add(key)
    }
    for (const key of baseExpressionPropertyKeys(view.filters)) keys.add(key)
  }
  return keys
}

function yamlField(key, value) {
  return YAML.stringify({ [key]: value })
    .trimEnd()
    .split("\n")
}

function passthroughFrontmatter(data) {
  const keys = [...new Set([...passthroughFrontmatterKeys, ...baseReferencedFrontmatterKeys])]
  const passthrough = Object.fromEntries(
    keys.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]),
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

function resolvedRelationshipFrontmatter(value, note, resolve) {
  if (Array.isArray(value)) {
    return value.map((item) => resolvedRelationshipFrontmatter(item, note, resolve)).filter(Boolean)
  }
  if (typeof value !== "string") return value
  const match = value.match(/^\[\[([^\]|#]+)(#[^\]|]+)?(?:\|([^\]]+))?\]\]$/)
  if (!match) return value
  const slug = resolve(note, match[1])
  if (!slug) return undefined
  const anchor = match[2] ?? ""
  const label = match[3] || cleanTitle(match[1])
  return `[[${slug}${anchor}|${label}]]`
}

function passthroughFrontmatterForNote(note, resolve) {
  const data = passthroughFrontmatter(note.frontmatter)
  for (const key of ["next", "previous", "parents", "children", ...relationNames]) {
    if (data[key] === undefined) continue
    const resolved = resolvedRelationshipFrontmatter(data[key], note, resolve)
    if (resolved === undefined || (Array.isArray(resolved) && resolved.length === 0)) delete data[key]
    else data[key] = resolved
  }
  return data
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
  const expanded = normalizeTags(data.tags).flatMap((tag) => {
    const segments = tag.split("/").filter(Boolean)
    return segments.map((_, index) => segments.slice(0, index + 1).join("/"))
  })
  return [...new Set(["zettel", ...expanded])]
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
const baseReferencedFrontmatterKeys = new Set()
for (const file of baseFiles) {
  try {
    const data = YAML.parse(await readFile(file, "utf8"))
    for (const key of baseViewPropertyKeys(data)) baseReferencedFrontmatterKeys.add(key)
  } catch {}
}
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
  const publicData = publicFrontmatter(data, file)
  const learningClips = await learningClipsForNote(file, text, data)
  const learningData = learningClips.length ? { learningClips } : {}
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
      ? { ...publicData, ...learningData, cover: `[[${publishedAssetPath(relDir, coverAsset)}]]` }
      : externalCover
        ? {
            ...publicData,
            ...learningData,
            cover: `[[${publishedAssetPath(relDir, externalCover)}]]`,
          }
        : { ...publicData, ...learningData },
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
const baseSlugs = baseFiles.map((file) => slugPath(outputPath(file)))
const baseSlugSet = new Set(baseSlugs)
const baseStemToPath = new Map(
  baseFiles.map((file, index) => [cleanTitle(path.basename(outputPath(file))), baseSlugs[index]]),
)
const folderIndexBySlug = new Map(
  rawNotes
    .filter((note) => note.relDir)
    .map((note) => [slugPath(note.relDir), slugPath(path.join(note.relDir, "index.md"))]),
)
const resolve = (note, target, includeBases = false) => {
  if (target.includes("/")) {
    const explicitSlug = slugPath(cleanTargetPath(target))
    if (slugSet.has(explicitSlug)) return explicitSlug
    if (includeBases && baseSlugSet.has(explicitSlug)) return explicitSlug
    const folderIndexSlug = folderIndexBySlug.get(explicitSlug)
    if (folderIndexSlug) return folderIndexSlug
  }

  const lookup = lookupByLanguage.get(languageGroup(note))
  const noteSlug =
    lookup?.titleToPath.get(cleanTitle(target)) ||
    lookup?.stemToPath.get(cleanTitle(target)) ||
    null
  return noteSlug || (includeBases ? baseStemToPath.get(cleanTitle(target)) || null : null)
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
    rewriteWikiLinks(stripFrontmatter(note.text), note, (sourceNote, target) =>
      resolve(sourceNote, target, true),
    ),
    note.externalAssets,
    note.file,
  )
  const sourcePath = path.relative(vaultRoot, note.file)
  const graphLinks = [
    ...new Set(relationNames.flatMap((name) => note.relations[name]).filter(Boolean)),
  ]
  const output = isExcalidraw
    ? note.text.replace(/^\s*-\s*excalidraw\s*$/m, "").trimEnd() + "\n"
    : frontmatter(
        note.title,
        sourcePath,
        graphLinks,
        [],
        passthroughFrontmatterForNote(note, resolve),
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

await mkdir(path.dirname(localMediaAliasManifest), { recursive: true })
await writeFile(
  localMediaAliasManifest,
  `${JSON.stringify(
    {
      version: 1,
      aliases: Object.fromEntries(
        [...localMediaAliases].sort(([left], [right]) => left.localeCompare(right)),
      ),
    },
    null,
    2,
  )}\n`,
)

console.log(`Synced ${rawNotes.length} published Digital Garden notes into ${contentRoot}`)
if (localMediaAliases.size)
  console.log(`Linked ${localMediaAliases.size} local media files through private aliases`)
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
