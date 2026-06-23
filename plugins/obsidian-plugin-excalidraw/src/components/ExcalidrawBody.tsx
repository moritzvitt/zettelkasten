import type {
  QuartzComponent,
  QuartzComponentConstructor,
  QuartzComponentProps,
  QuartzPluginData,
  FullSlug,
  FilePath,
} from "@quartz-community/types"
import {
  resolveRelative,
  slugifyFilePath,
  normalizeHastElement,
} from "@quartz-community/utils/path"
import { toHtml } from "hast-util-to-html"
import type { ExcalidrawData, ExcalidrawPageOptions } from "../types"
import { renderToSvg } from "../renderer"
import type { ResolvedEmbed, ResolvedNoteImage, RenderContext, EmbedOverlay } from "../renderer"
import { resolveEmbedPage } from "../resolve"
import type { ExportSvgNoteArea } from "../exportSvg"
import style from "./styles/excalidraw.scss"
// @ts-expect-error inline script import handled by bundler
import script from "./scripts/excalidraw.inline.ts"

function stripTranscludes(html: string): string {
  return html
    .replace(/<blockquote[^>]*class="[^"]*transclude[^"]*"[^>]*>[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<div[^>]*class="[^"]*transclude[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
}

function embeddedLink(data: ExcalidrawData, element: ExcalidrawData["elements"][number]): string {
  if (element.type === "embeddable" || element.type === "iframe") {
    return (element.link as string) ?? ""
  }
  if (element.type === "image" && element.fileId) {
    const target = data.embeddedFiles?.[element.fileId]
    return target ? `[[${target}]]` : ""
  }
  return ""
}

function resolveEmbeds(
  data: ExcalidrawData,
  currentSlug: FullSlug,
  allFiles: QuartzPluginData[],
): Record<string, ResolvedEmbed> {
  const result: Record<string, ResolvedEmbed> = {}
  const embeddables = data.elements.filter(
    (el) => (el.type === "embeddable" || el.type === "iframe") && Boolean(embeddedLink(data, el)),
  )

  for (const el of embeddables) {
    const link = embeddedLink(data, el)
    if (!link.startsWith("[[")) continue

    const target = link.replace(/^\[\[/, "").replace(/\]\]$/, "")
    const page = resolveEmbedPage(target, allFiles)

    const pageSlug = (page?.slug ?? slugifyFilePath(target as FilePath)) as FullSlug
    const href = resolveRelative(currentSlug, pageSlug)

    if (!page || !page.htmlAst) {
      result[el.id] = {
        html: `<a href="${href}" style="color:#228be6;text-decoration:none;font-size:13px;">${target}</a>`,
        href,
      }
      continue
    }

    const tree = page.htmlAst
    const rebased = {
      ...tree,
      children: tree.children.map((child: unknown) => {
        if ((child as { type: string }).type === "element") {
          return normalizeHastElement(
            child as Parameters<typeof normalizeHastElement>[0],
            currentSlug,
            pageSlug,
          )
        }
        return child
      }),
    }

    let html = toHtml(rebased as Parameters<typeof toHtml>[0], { allowDangerousHtml: true })
    html = stripTranscludes(html)
    result[el.id] = { html, href }
  }

  return result
}

function textFromHast(node: unknown): string {
  if (!node || typeof node !== "object") return ""
  const value = node as { type?: string; value?: unknown; tagName?: string; children?: unknown[] }
  if (value.type === "text" && typeof value.value === "string") return value.value
  if (value.tagName === "script" || value.tagName === "style") return ""
  return (value.children ?? []).map(textFromHast).join(" ")
}

function cleanNoteTarget(target: string): string {
  return target.split("|").pop()?.split("#")[0]?.split("/").pop()?.trim() || "Notiz"
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function wrapText(value: string, maxChars: number, maxLines: number): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean)
  const lines: string[] = []
  let line = ""

  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length <= maxChars) {
      line = next
      continue
    }
    if (line) lines.push(line)
    line = word.length > maxChars ? word.slice(0, maxChars) : word
    if (lines.length >= maxLines) break
  }
  if (line && lines.length < maxLines) lines.push(line)
  if (words.length > 0 && lines.length === maxLines) {
    lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/[.…]*$/, "")}…`
  }
  return lines
}

export function createNotePreviewDataUrl(
  title: string,
  body: string,
  width: number,
  height: number,
  missing = false,
): string {
  const safeWidth = Math.max(120, Math.round(width))
  const safeHeight = Math.max(80, Math.round(height))
  const padding = Math.max(12, Math.min(28, safeWidth * 0.05))
  const titleSize = Math.max(16, Math.min(28, safeWidth / 14))
  const bodySize = Math.max(11, Math.min(18, safeWidth / 24))
  const lineHeight = bodySize * 1.45
  const bodyTop = padding + titleSize + Math.max(14, bodySize)
  const maxChars = Math.max(18, Math.floor((safeWidth - padding * 2) / (bodySize * 0.55)))
  const maxLines = Math.max(1, Math.floor((safeHeight - bodyTop - padding) / lineHeight))
  const content = missing ? "Notiz nicht veröffentlicht" : body
  const lines = wrapText(content, maxChars, maxLines)
  const textLines = lines
    .map(
      (line, index) =>
        `<text x="${padding}" y="${bodyTop + index * lineHeight}" font-size="${bodySize}" fill="#495057">${escapeXml(line)}</text>`,
    )
    .join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${safeWidth} ${safeHeight}"><rect x="1" y="1" width="${safeWidth - 2}" height="${safeHeight - 2}" rx="10" fill="#fffdf8" stroke="#ced4da" stroke-width="2"/><rect x="1" y="1" width="6" height="${safeHeight - 2}" rx="3" fill="#228be6"/><text x="${padding}" y="${padding + titleSize}" font-family="system-ui,-apple-system,sans-serif" font-size="${titleSize}" font-weight="700" fill="#212529">${escapeXml(title)}</text><g font-family="system-ui,-apple-system,sans-serif">${textLines}</g></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function resolveNoteImages(
  data: ExcalidrawData,
  currentSlug: FullSlug,
  allFiles: QuartzPluginData[],
): Record<string, ResolvedNoteImage> {
  const result: Record<string, ResolvedNoteImage> = {}

  for (const el of data.elements) {
    if (el.type !== "image" || !el.fileId) continue
    if (data.files[el.fileId]?.dataURL) continue
    const target = data.embeddedFiles?.[el.fileId]
    if (!target) continue

    const page = resolveEmbedPage(target, allFiles)
    const pageSlug = (page?.slug ?? slugifyFilePath(target as FilePath)) as FullSlug
    const title = page?.frontmatter?.title ?? cleanNoteTarget(target)
    const body = page?.htmlAst ? textFromHast(page.htmlAst) : ""
    result[el.id] = {
      dataUrl: createNotePreviewDataUrl(title, body, el.width, el.height, !page),
      href: resolveRelative(currentSlug, pageSlug),
      title,
    }
  }

  return result
}

function resolveImages(
  imagePaths: Record<string, string>,
  currentSlug: FullSlug,
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [hash, filePath] of Object.entries(imagePaths)) {
    const imageSlug = slugifyFilePath(filePath as FilePath) as FullSlug
    result[hash] = resolveRelative(currentSlug, imageSlug)
  }

  return result
}

interface ExcalidrawExportData {
  lightPath?: string
  darkPath?: string
  viewBox: { width: number; height: number }
  noteAreas: ExportSvgNoteArea[]
}

interface PublishedNoteHotspot extends ExportSvgNoteArea {
  href: string
  title: string
}

function assetUrl(filePath: string | undefined, currentSlug: FullSlug): string | undefined {
  if (!filePath) return undefined
  if (filePath.startsWith("/")) {
    return filePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")
  }
  return resolveRelative(currentSlug, slugifyFilePath(filePath as FilePath) as FullSlug)
}

function resolvePublishedNoteHotspots(
  exportData: ExcalidrawExportData,
  data: ExcalidrawData,
  currentSlug: FullSlug,
  allFiles: QuartzPluginData[],
): PublishedNoteHotspot[] {
  return exportData.noteAreas.flatMap((area) => {
    const target = data.embeddedFiles?.[area.fileId]
    if (!target) return []
    const page = resolveEmbedPage(target, allFiles)
    if (!page?.slug) return []
    return [
      {
        ...area,
        href: resolveRelative(currentSlug, page.slug),
        title: String(page.frontmatter?.title ?? cleanNoteTarget(target)),
      },
    ]
  })
}

function renderPublishedNoteHotspot(hotspot: PublishedNoteHotspot): unknown {
  return (
    <a
      class="excalidraw-note-hotspot"
      href={hotspot.href}
      data-note-href={hotspot.href}
      data-x={hotspot.x}
      data-y={hotspot.y}
      data-w={hotspot.width}
      data-h={hotspot.height}
      data-angle={hotspot.angle}
      aria-label={`Zettel öffnen: ${hotspot.title}`}
      title={hotspot.title}
    />
  )
}

function renderOverlay(overlay: EmbedOverlay): unknown {
  const label = overlay.link
    .replace(/^\[\[/, "")
    .replace(/\]\]$/, "")
    .replace(/^https?:\/\//, "")
  const truncatedLabel = label.length > 50 ? label.slice(0, 47) + "..." : label

  if (overlay.isWikilink) {
    const noteContent = overlay.resolved
      ? `<a href="${overlay.resolved.href}" class="excalidraw-embed-open-link">Open note →</a><div class="excalidraw-embed-body">${overlay.resolved.html}</div>`
      : `<span class="excalidraw-embed-missing">Note not found</span>`

    return (
      <div
        class="excalidraw-overlay excalidraw-embed-note"
        data-overlay-id={overlay.id}
        data-x={overlay.x}
        data-y={overlay.y}
        data-w={overlay.width}
        data-h={overlay.height}
      >
        <div class="excalidraw-embed-header">{"📄 " + truncatedLabel}</div>
        <div class="excalidraw-embed-content" dangerouslySetInnerHTML={{ __html: noteContent }} />
      </div>
    )
  }

  return (
    <div
      class="excalidraw-overlay excalidraw-embed-url"
      data-overlay-id={overlay.id}
      data-x={overlay.x}
      data-y={overlay.y}
      data-w={overlay.width}
      data-h={overlay.height}
    >
      <div class="excalidraw-embed-header">
        <a href={overlay.link} target="_blank" rel="noopener noreferrer">
          {"🔗 " + truncatedLabel}
        </a>
      </div>
      <iframe
        src={overlay.link}
        class="excalidraw-embed-iframe"
        sandbox="allow-scripts allow-same-origin allow-popups"
        loading="lazy"
        referrerpolicy="no-referrer"
      />
    </div>
  )
}

export default ((userOpts?: ExcalidrawPageOptions) => {
  const Component: QuartzComponent = (props: QuartzComponentProps) => {
    const { fileData, allFiles } = props
    const data = fileData.excalidrawData as ExcalidrawData
    const options = (fileData.excalidrawOptions as ExcalidrawPageOptions) ?? userOpts ?? {}
    const currentSlug = fileData.slug!
    const exportData = fileData.excalidrawExport as ExcalidrawExportData | undefined
    const lightExportUrl = assetUrl(exportData?.lightPath, currentSlug)
    const darkExportUrl = assetUrl(exportData?.darkPath, currentSlug)
    const hasExport = Boolean(exportData && (lightExportUrl || darkExportUrl))
    const publishedNoteHotspots =
      exportData && allFiles
        ? resolvePublishedNoteHotspots(exportData, data, currentSlug, allFiles)
        : []

    const resolvedEmbedMap = allFiles ? resolveEmbeds(data, currentSlug, allFiles) : undefined
    const resolvedNoteImageMap = allFiles
      ? resolveNoteImages(data, currentSlug, allFiles)
      : undefined
    const imagePaths = (fileData.excalidrawImagePaths as Record<string, string>) ?? {}
    const resolvedImageMap = resolveImages(imagePaths, currentSlug)
    const renderCtx: RenderContext = {
      resolvedEmbeds: resolvedEmbedMap,
      resolvedImages: resolvedImageMap,
      resolvedNoteImages: resolvedNoteImageMap,
    }
    const result = renderToSvg(data, options, renderCtx)

    return (
      <article
        class="excalidraw-page"
        role="img"
        aria-label={fileData.frontmatter?.title ?? "Excalidraw drawing"}
      >
        <div class="excalidraw-controls">
          <button class="excalidraw-zoom-in" type="button" aria-label="Zoom in">
            +
          </button>
          <button class="excalidraw-zoom-out" type="button" aria-label="Zoom out">
            −
          </button>
          <button class="excalidraw-reset" type="button" aria-label="Reset view">
            ⟲
          </button>
        </div>
        <div class="excalidraw-container">
          <div class="excalidraw-canvas">
            {hasExport ? (
              <img
                class="excalidraw-export-image"
                src={lightExportUrl ?? darkExportUrl}
                data-light-src={lightExportUrl}
                data-dark-src={darkExportUrl}
                alt=""
                draggable={false}
              />
            ) : (
              <div
                class="excalidraw-rendered-svg"
                dangerouslySetInnerHTML={{ __html: result.svg }}
              />
            )}
            <div
              class="excalidraw-overlays"
              data-export={hasExport ? "true" : undefined}
              data-viewbox-w={exportData?.viewBox.width ?? result.viewBox.width}
              data-viewbox-h={exportData?.viewBox.height ?? result.viewBox.height}
              data-offset-x={result.viewBox.offsetX}
              data-offset-y={result.viewBox.offsetY}
            >
              {hasExport
                ? publishedNoteHotspots.map((hotspot) => renderPublishedNoteHotspot(hotspot))
                : result.overlays.map((overlay) => renderOverlay(overlay))}
            </div>
          </div>
        </div>
        {options.enableInteraction !== false && (
          <script
            type="application/json"
            class="excalidraw-data"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                elements: data.elements,
                appState: data.appState,
                files: data.files,
              }),
            }}
          />
        )}
      </article>
    )
  }

  Component.css = style
  Component.afterDOMLoaded = script

  return Component
}) satisfies QuartzComponentConstructor
