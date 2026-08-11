import { render } from "preact-render-to-string"
import { QuartzComponent, QuartzComponentProps } from "./types"
import BodyConstructor from "./Body"
import {
  CSSResource,
  JSResource,
  JSResourceToScriptElement,
  StaticResources,
} from "../util/resources"
import { FullSlug, RelativeURL, joinSegments, normalizeHastElement } from "../util/path"
import { clone } from "../util/clone"
import { Root, Element, ElementContent } from "hast"
import { GlobalConfiguration } from "../cfg"
import { i18n } from "../i18n"
import { styleText } from "util"
import { resolveFrame } from "./frames"
import type { TreeTransform } from "../plugins/types"
import type { BuildCtx } from "../util/ctx"

interface RenderComponents {
  head: QuartzComponent
  header: QuartzComponent[]
  beforeBody: QuartzComponent[]
  pageBody: QuartzComponent
  afterBody: QuartzComponent[]
  left: QuartzComponent[]
  right: QuartzComponent[]
  footer: QuartzComponent
  frame?: string
}

const headerRegex = new RegExp(/h[1-6]/)
const excalidrawBlockRefRegex = /^#\^(area|group|frame)=([^&]+)$/
const excalidrawTranscludeScript = `
function setupExcalidrawTranscludes() {
  const figures = document.querySelectorAll(".excalidraw-transclude:not([data-excalidraw-transclude-ready])")

  for (const figure of figures) {
    figure.setAttribute("data-excalidraw-transclude-ready", "true")
    const svg = figure.querySelector(".excalidraw-transclude-svg")
    if (!svg) continue

    const values = (svg.getAttribute("viewBox") || "").trim().split(/[\\s,]+/).map(Number)
    if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) continue

    const initial = { x: values[0], y: values[1], width: values[2], height: values[3] }
    let viewBox = { ...initial }
    let dragging = false
    let pointerId = null
    let startX = 0
    let startY = 0
    let originX = 0
    let originY = 0
    let moved = false
    let pendingFrame = 0

    const applyViewBoxNow = () => {
      pendingFrame = 0
      svg.setAttribute("viewBox", [viewBox.x, viewBox.y, viewBox.width, viewBox.height].join(" "))
      figure.classList.toggle("is-zoomed", viewBox.width < initial.width - 0.001)
    }

    const applyViewBox = () => {
      if (pendingFrame) return
      pendingFrame = requestAnimationFrame(applyViewBoxNow)
    }

    const reset = () => {
      viewBox = { ...initial }
      applyViewBox()
    }

    const clientToSvg = (clientX, clientY) => {
      const point = svg.createSVGPoint()
      point.x = clientX
      point.y = clientY
      const matrix = svg.getScreenCTM()
      return matrix ? point.matrixTransform(matrix.inverse()) : null
    }

    const zoomAt = (factor, clientX, clientY) => {
      const point = clientToSvg(clientX, clientY)
      if (!point) return

      const currentScale = initial.width / viewBox.width
      const nextScale = Math.min(18, Math.max(1, currentScale * factor))
      const nextWidth = initial.width / nextScale
      const nextHeight = initial.height / nextScale
      const widthRatio = nextWidth / viewBox.width
      const heightRatio = nextHeight / viewBox.height

      viewBox = {
        x: point.x - (point.x - viewBox.x) * widthRatio,
        y: point.y - (point.y - viewBox.y) * heightRatio,
        width: nextWidth,
        height: nextHeight,
      }

      if (nextScale === 1) viewBox = { ...initial }
      applyViewBox()
    }

    figure.addEventListener(
      "wheel",
      (event) => {
        if (!event.shiftKey) return
        const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
        if (!delta) return
        event.preventDefault()
        zoomAt(Math.exp(-delta * 0.002), event.clientX, event.clientY)
      },
      { passive: false },
    )

    figure.addEventListener("pointerdown", (event) => {
      if (!event.shiftKey || event.button !== 0) return
      event.preventDefault()
      dragging = true
      pointerId = event.pointerId
      startX = event.clientX
      startY = event.clientY
      originX = viewBox.x
      originY = viewBox.y
      moved = false
      figure.classList.add("is-dragging")
      figure.setPointerCapture(pointerId)
    })

    figure.addEventListener("pointermove", (event) => {
      if (!dragging || event.pointerId !== pointerId) return
      event.preventDefault()
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 4) moved = true
      const rect = svg.getBoundingClientRect()
      const unitsPerPixel = Math.max(viewBox.width / rect.width, viewBox.height / rect.height)
      viewBox.x = originX - (event.clientX - startX) * unitsPerPixel
      viewBox.y = originY - (event.clientY - startY) * unitsPerPixel
      applyViewBox()
    })

    const stopDragging = (event) => {
      if (!dragging || event.pointerId !== pointerId) return
      dragging = false
      pointerId = null
      figure.classList.remove("is-dragging")
    }

    figure.addEventListener("pointerup", stopDragging)
    figure.addEventListener("pointercancel", stopDragging)
    figure.addEventListener("click", (event) => {
      const openInNewContext = event.metaKey || event.ctrlKey || event.altKey || event.button === 1
      if (moved || event.shiftKey || !openInNewContext) {
        event.preventDefault()
        event.stopPropagation()
      }
      moved = false
    })
    figure.addEventListener("dblclick", (event) => {
      if (!event.shiftKey) return
      event.preventDefault()
      reset()
    })

    applyViewBox()
  }
}

document.addEventListener("nav", setupExcalidrawTranscludes)
document.addEventListener("render", setupExcalidrawTranscludes)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupExcalidrawTranscludes, { once: true })
} else {
  setupExcalidrawTranscludes()
}
`

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function elementBounds(element: Record<string, unknown>) {
  const x = numeric(element.x)
  const y = numeric(element.y)
  const width = numeric(element.width)
  const height = numeric(element.height)
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return undefined
  }

  return {
    x: Math.min(x, x + width),
    y: Math.min(y, y + height),
    width: Math.abs(width),
    height: Math.abs(height),
  }
}

function mergeBounds(
  current: { x: number; y: number; width: number; height: number } | undefined,
  next: { x: number; y: number; width: number; height: number } | undefined,
) {
  if (!next) return current
  if (!current) return next

  const x = Math.min(current.x, next.x)
  const y = Math.min(current.y, next.y)
  const maxX = Math.max(current.x + current.width, next.x + next.width)
  const maxY = Math.max(current.y + current.height, next.y + next.height)
  return { x, y, width: maxX - x, height: maxY - y }
}

function excalidrawDataBounds(elements: Record<string, unknown>[]) {
  return elements.reduce<{ x: number; y: number; width: number; height: number } | undefined>(
    (bounds, element) => {
      if (element.isDeleted) return bounds
      return mergeBounds(bounds, elementBounds(element))
    },
    undefined,
  )
}

function excalidrawFragmentBounds(
  elements: Record<string, unknown>[],
  fragmentKind: string,
  fragmentId: string,
) {
  const decodedFragmentId = decodeURIComponent(fragmentId)
  const element = elements.find(
    (item) =>
      !item.isDeleted &&
      (item.id === fragmentId ||
        item.id === decodedFragmentId ||
        (fragmentKind === "frame" && item.type === "frame" && item.name === decodedFragmentId)),
  )
  if (!element) return undefined

  if (fragmentKind === "frame") {
    return elementBounds(element)
  }

  if (fragmentKind === "group") {
    const groupIds = Array.isArray(element.groupIds) ? element.groupIds : []
    const groupId = groupIds.at(-1)
    if (typeof groupId === "string") {
      const groupedBounds = elements.reduce<
        { x: number; y: number; width: number; height: number } | undefined
      >((bounds, item) => {
        const itemGroupIds = Array.isArray(item.groupIds) ? item.groupIds : []
        if (item.isDeleted || !itemGroupIds.includes(groupId)) return bounds
        return mergeBounds(bounds, elementBounds(item))
      }, undefined)
      if (groupedBounds) return groupedBounds
    }
  }

  return elementBounds(element)
}

function renderExcalidrawTransclude(
  el: Element,
  page: Record<string, unknown>,
  blockRef: string | undefined,
  inner: Element,
) {
  const match = blockRef?.match(excalidrawBlockRefRegex)
  const exportData = page.excalidrawExport as
    | {
        lightPath?: string
        darkPath?: string
        viewBox?: { width?: number; height?: number }
      }
    | undefined
  const elements = (page.excalidrawData as { elements?: Record<string, unknown>[] } | undefined)
    ?.elements
  const imagePath = exportData?.lightPath ?? exportData?.darkPath
  const viewBoxWidth = numeric(exportData?.viewBox?.width)
  const viewBoxHeight = numeric(exportData?.viewBox?.height)
  if (!match || !elements || !imagePath || !viewBoxWidth || !viewBoxHeight) return false

  const drawingBounds = excalidrawDataBounds(elements)
  const fragmentBounds = excalidrawFragmentBounds(elements, match[1]!, match[2]!)
  if (!drawingBounds || !fragmentBounds) return false

  const exportPadding = 10
  const cropPadding = match[1] === "group" ? 48 : match[1] === "frame" ? 0 : 24
  const x = Math.max(0, fragmentBounds.x - drawingBounds.x + exportPadding - cropPadding)
  const y = Math.max(0, fragmentBounds.y - drawingBounds.y + exportPadding - cropPadding)
  const maxX = Math.min(
    viewBoxWidth,
    fragmentBounds.x - drawingBounds.x + exportPadding + fragmentBounds.width + cropPadding,
  )
  const maxY = Math.min(
    viewBoxHeight,
    fragmentBounds.y - drawingBounds.y + exportPadding + fragmentBounds.height + cropPadding,
  )
  const width = Math.max(1, maxX - x)
  const height = Math.max(1, maxY - y)

  el.tagName = "figure"
  el.properties = { className: ["excalidraw-transclude"] }
  el.children = [
    {
      type: "element",
      tagName: "span",
      properties: { className: ["excalidraw-transclude-hint"] },
      children: [{ type: "text", value: "Shift halten: zoomen / verschieben" }],
    },
    {
      type: "element",
      tagName: "a",
      properties: {
        href: inner.properties?.href,
        className: ["internal", "internal-link", "excalidraw-transclude-link"],
        dataNoPopover: "true",
      },
      children: [
        {
          type: "element",
          tagName: "svg",
          properties: {
            className: ["excalidraw-transclude-svg"],
            viewBox: `${x} ${y} ${width} ${height}`,
            role: "img",
          },
          children: [
            {
              type: "element",
              tagName: "image",
              properties: {
                href: imagePath,
                x: 0,
                y: 0,
                width: viewBoxWidth,
                height: viewBoxHeight,
              },
              children: [],
            },
          ],
        },
      ],
    },
  ]

  return true
}

export function pageResources(
  baseDir: FullSlug | RelativeURL,
  staticResources: StaticResources,
  ctx?: BuildCtx,
): StaticResources {
  const hashedNames = ctx?.hashedResourceNames
  const cssFile = hashedNames?.["index.css"] ?? "index.css"
  const prescriptFile = hashedNames?.["prescript.js"] ?? "prescript.js"
  const postscriptFile = hashedNames?.["postscript.js"] ?? "postscript.js"

  const componentCssResources: CSSResource[] = []
  if (ctx?.componentCssMap) {
    const seen = new Set<string>()
    for (const filename of ctx.componentCssMap.values()) {
      if (seen.has(filename)) continue
      seen.add(filename)
      componentCssResources.push({ content: joinSegments(baseDir, filename) })
    }
  }

  const extracted = ctx?.extractedInlineResources
  const resolvedCss: CSSResource[] = staticResources.css.map((resource) => {
    if (!(resource.inline ?? false) || !extracted) return resource
    const filename = extracted.get(resource.content)
    if (!filename) return resource
    return { content: joinSegments(baseDir, filename) }
  })

  const resolvedJs: JSResource[] = staticResources.js.map((resource) => {
    if (resource.contentType !== "inline" || !extracted) return resource
    const filename = extracted.get(resource.script)
    if (!filename) return resource
    return {
      src: joinSegments(baseDir, filename),
      loadTime: resource.loadTime,
      contentType: "external" as const,
      moduleType: resource.moduleType,
      spaPreserve: resource.spaPreserve,
    }
  })

  const contentIndexPath = joinSegments(baseDir, "static/contentIndex.json")
  const contentIndexScript = `const fetchData = fetch("${contentIndexPath}").then(data => data.json())`
  const resources: StaticResources = {
    css: [
      {
        content: joinSegments(baseDir, cssFile),
      },
      ...componentCssResources,
      ...resolvedCss,
    ],
    js: [
      {
        src: joinSegments(baseDir, prescriptFile),
        loadTime: "beforeDOMReady",
        contentType: "external",
      },
      {
        loadTime: "beforeDOMReady",
        contentType: "inline",
        spaPreserve: true,
        script: contentIndexScript,
      },
      ...resolvedJs,
      {
        loadTime: "afterDOMReady",
        contentType: "inline",
        spaPreserve: true,
        script: excalidrawTranscludeScript,
      },
    ],
    additionalHead: staticResources.additionalHead,
  }

  resources.js.push({
    src: joinSegments(baseDir, postscriptFile),
    loadTime: "afterDOMReady",
    moduleType: "module",
    contentType: "external",
  })

  return resources
}

/** @internal Exported for testing only. */
export function renderTranscludes(
  root: Root,
  cfg: GlobalConfiguration,
  slug: FullSlug,
  componentData: QuartzComponentProps,
  visited: Set<FullSlug>,
) {
  // Walk the tree manually instead of using visit() so we can track the
  // ancestor chain for cycle detection. visit() runs the callback before
  // descending into replaced children, so a Set-based guard there falsely
  // rejects sibling transclusions of the same target.
  function walk(node: Element | Root) {
    const children = (node as Root).children ?? []
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (child?.type !== "element") continue
      const el = child as Element

      if (el.tagName !== "blockquote") {
        walk(el)
        continue
      }

      const classNames = (el.properties?.className ?? []) as string[]
      if (!classNames.includes("transclude")) {
        walk(el)
        continue
      }

      const inner = el.children[0] as Element
      const transcludeTarget = (inner.properties["data-slug"] ?? slug) as FullSlug
      if (visited.has(transcludeTarget)) {
        console.warn(
          styleText(
            "yellow",
            `Warning: Skipping circular transclusion: ${slug} -> ${transcludeTarget}`,
          ),
        )
        el.children = [
          {
            type: "element",
            tagName: "p",
            properties: { style: "color: var(--secondary);" },
            children: [
              {
                type: "text",
                value: `Circular transclusion detected: ${transcludeTarget}`,
              },
            ],
          },
        ]
        continue
      }

      visited.add(transcludeTarget)

      let page = componentData.allFiles.find((f) => f.slug === transcludeTarget)
      if (!page) {
        const dotIdx = transcludeTarget.lastIndexOf(".")
        const slashIdx = transcludeTarget.lastIndexOf("/")
        if (dotIdx > slashIdx + 1) {
          const stripped = transcludeTarget.slice(0, dotIdx) as FullSlug
          page = componentData.allFiles.findLast((f) => f.slug === stripped)
        }
      }
      if (!page) {
        visited.delete(transcludeTarget)
        continue
      }

      let blockRef = el.properties.dataBlock as string | undefined
      if (renderExcalidrawTransclude(el, page, blockRef, inner)) {
        visited.delete(transcludeTarget)
        continue
      }

      if (blockRef?.startsWith("#^")) {
        // block transclude
        blockRef = blockRef.slice("#^".length)
        let blockNode = page.blocks?.[blockRef]
        if (blockNode) {
          if (blockNode.tagName === "li") {
            blockNode = {
              type: "element",
              tagName: "ul",
              properties: {},
              children: [blockNode],
            }
          }

          el.children = [
            normalizeHastElement(blockNode, slug, transcludeTarget),
            {
              type: "element",
              tagName: "a",
              properties: {
                href: inner.properties?.href,
                class: ["internal", "internal-link", "transclude-src"],
              },
              children: [
                { type: "text", value: i18n(cfg.locale).components.transcludes.linkToOriginal },
              ],
            },
          ]
        }
      } else if (blockRef?.startsWith("#") && page.htmlAst) {
        // header transclude
        blockRef = blockRef.slice(1)
        let startIdx = undefined
        let startDepth = undefined
        let endIdx = undefined
        for (const [i, htmlEl] of page.htmlAst.children.entries()) {
          if (!(htmlEl.type === "element" && htmlEl.tagName.match(headerRegex))) continue
          const depth = Number(htmlEl.tagName.substring(1))

          if (startIdx === undefined || startDepth === undefined) {
            if (htmlEl.properties?.id === blockRef) {
              startIdx = i
              startDepth = depth
            }
          } else if (depth <= startDepth) {
            endIdx = i
            break
          }
        }

        if (startIdx === undefined) {
          visited.delete(transcludeTarget)
          continue
        }

        el.children = [
          ...(page.htmlAst.children.slice(startIdx, endIdx) as ElementContent[]).map((c) =>
            normalizeHastElement(c as Element, slug, transcludeTarget),
          ),
          {
            type: "element",
            tagName: "a",
            properties: {
              href: inner.properties?.href,
              class: ["internal", "internal-link", "transclude-src"],
            },
            children: [
              { type: "text", value: i18n(cfg.locale).components.transcludes.linkToOriginal },
            ],
          },
        ]
      } else if (page.htmlAst) {
        // page transclude
        el.children = [
          {
            type: "element",
            tagName: "h1",
            properties: {},
            children: [
              {
                type: "text",
                value:
                  page.frontmatter?.title ??
                  i18n(cfg.locale).components.transcludes.transcludeOf({
                    targetSlug: page.slug!,
                  }),
              },
            ],
          },
          ...(page.htmlAst.children as ElementContent[]).map((c) =>
            normalizeHastElement(c as Element, slug, transcludeTarget),
          ),
          {
            type: "element",
            tagName: "a",
            properties: {
              href: inner.properties?.href,
              class: ["internal", "internal-link", "transclude-src"],
            },
            children: [
              { type: "text", value: i18n(cfg.locale).components.transcludes.linkToOriginal },
            ],
          },
        ]
      }

      // Recurse into the replaced children to resolve nested transclusions,
      // then remove from visited so sibling embeds of the same target work.
      walk(el)
      visited.delete(transcludeTarget)
    }
  }

  walk(root)
}

function hastText(node: Element | Root): string {
  return (node.children ?? [])
    .map((child) =>
      child.type === "text" ? child.value : child.type === "element" ? hastText(child) : "",
    )
    .join("")
}

/** Keep rendered heading IDs and generated table-of-contents links in agreement. */
export function alignHeadingIdsWithToc(root: Root, toc: unknown) {
  if (!Array.isArray(toc)) return
  const remaining = toc.filter(
    (entry): entry is { slug: unknown; text: unknown } =>
      Boolean(entry && typeof entry === "object" && "slug" in entry && "text" in entry),
  )

  const walk = (node: Element | Root) => {
    for (const child of node.children ?? []) {
      if (child.type !== "element") continue
      if (/^h[1-6]$/.test(child.tagName)) {
        const text = hastText(child).trim()
        const index = remaining.findIndex((entry) => String(entry.text).trim() === text)
        if (index >= 0) {
          child.properties.id = String(remaining[index].slug)
          remaining.splice(index, 1)
        }
      }
      walk(child)
    }
  }
  walk(root)
}

export function renderPage(
  cfg: GlobalConfiguration,
  slug: FullSlug,
  componentData: QuartzComponentProps,
  components: RenderComponents,
  pageResources: StaticResources,
  treeTransforms?: TreeTransform[],
): string {
  // make a deep copy of the tree so we don't remove the transclusion references
  // for the file cached in contentMap in build.ts
  const root = clone(componentData.tree) as Root
  const visited = new Set<FullSlug>([slug])
  renderTranscludes(root, cfg, slug, componentData, visited)

  // Run plugin-provided tree transforms (e.g. resolving inline bases codeblocks)
  if (treeTransforms) {
    for (const transform of treeTransforms) {
      transform(root, slug, componentData)
    }
  }

  alignHeadingIdsWithToc(root, componentData.fileData.toc)

  // set componentData.tree to the edited html that has transclusions rendered
  componentData.tree = root

  const {
    head: Head,
    header,
    beforeBody,
    pageBody: Content,
    afterBody,
    left,
    right,
    footer: Footer,
    frame: frameName,
  } = components
  const Body = BodyConstructor()
  const frame = resolveFrame(frameName)

  const lang = componentData.fileData.frontmatter?.lang ?? cfg.locale?.split("-")[0] ?? "en"
  const direction = i18n(cfg.locale).direction ?? "ltr"
  // During local dev (--serve), the dev server serves from root without the
  // baseUrl subpath, so basePath must be empty to avoid broken links.
  const basePath =
    componentData.ctx.argv.serve || !cfg.baseUrl
      ? ""
      : new URL(`https://${cfg.baseUrl}`).pathname.replace(/\/$/, "")
  const doc = (
    <html lang={lang} dir={direction}>
      <Head {...componentData} />
      <body data-slug={slug} data-basepath={basePath}>
        {frame.css && <style dangerouslySetInnerHTML={{ __html: frame.css }} />}
        <div id="quartz-root" class="page" data-frame={frame.name}>
          <Body {...componentData}>
            {[
              frame.render({
                componentData,
                head: Head,
                header,
                beforeBody,
                pageBody: Content,
                afterBody,
                left,
                right,
                footer: Footer,
              }),
            ]}
          </Body>
        </div>
      </body>
      {pageResources.js
        .filter((resource) => resource.loadTime === "afterDOMReady")
        .map((res) => JSResourceToScriptElement(res, true))}
    </html>
  )

  return "<!DOCTYPE html>\n" + render(doc)
}
