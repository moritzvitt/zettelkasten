import { visit } from "unist-util-visit"

function propertyValue(value) {
  return Array.isArray(value) ? value.join(" ") : value
}

function isExcalidrawSvgUrl(value) {
  if (typeof value !== "string") return false
  return value.includes("static/excalidraw/") || /\.excalidraw(?:\.|$)/i.test(value)
}

function numericDimension(value) {
  const normalized = String(propertyValue(value) ?? "").trim()
  return /^\d+$/.test(normalized) ? normalized : undefined
}

function normalizeSvgObjectEmbeds() {
  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "object") return

      const properties = node.properties ?? {}
      const type = String(propertyValue(properties.type) ?? "").toLowerCase()
      const data = propertyValue(properties.data)
      if (type !== "image/svg+xml" || typeof data !== "string" || isExcalidrawSvgUrl(data)) {
        return
      }

      const width = numericDimension(properties.width)
      const height = numericDimension(properties.height)
      const alt = String(propertyValue(properties.ariaLabel ?? properties["aria-label"]) ?? "")

      node.tagName = "img"
      node.properties = {
        src: data,
        alt,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
      }
      node.children = []
    })
  }
}

const viewerScript = `
let svgLinkIndexPromise

function trimSlashes(value) {
  return String(value || "").replace(/^\\/+|\\/+$/g, "")
}

function basePath() {
  const base = trimSlashes(document.body?.dataset?.basepath || "")
  return base ? "/" + base : ""
}

function staticUrl(file) {
  return basePath() + "/static/" + file
}

function pageUrl(slug) {
  return basePath() + "/" + (slug === "index" ? "" : slug)
}

function normalizeLinkKey(value) {
  let key = String(value || "").trim()
  try {
    key = decodeURIComponent(key)
  } catch {}
  if (key.startsWith("[[") && key.endsWith("]]")) key = key.slice(2, -2)
  key = key.split("|")[0].split("#")[0].trim()
  return trimSlashes(key.replace(/\\\\/g, "/").replace(/\\.md$/i, ""))
}

function addLinkKey(map, key, slug) {
  const normalized = normalizeLinkKey(key)
  if (!normalized || map.has(normalized)) return
  map.set(normalized, slug)
}

async function getSvgLinkIndex() {
  if (!svgLinkIndexPromise) {
    svgLinkIndexPromise = fetch(staticUrl("brain-index.json"))
      .then((response) => {
        if (!response.ok) throw new Error("Linkindex konnte nicht geladen werden")
        return response.json()
      })
      .then((index) => {
        const links = new Map()
        for (const [slug, node] of Object.entries(index.nodes || {})) {
          addLinkKey(links, slug, slug)
          addLinkKey(links, node.title, slug)
          addLinkKey(links, node.source, slug)
          addLinkKey(links, String(node.source || "").replace(/^Digital Garden\\//, ""), slug)
          addLinkKey(links, String(node.source || "").split("/").pop(), slug)
        }
        return links
      })
      .catch((error) => {
        console.warn("[SvgViewer] Interne Links konnten nicht aufgeloest werden", error)
        return new Map()
      })
  }
  return svgLinkIndexPromise
}

function sanitizeSvg(svg) {
  for (const script of svg.querySelectorAll("script")) script.remove()
  for (const element of svg.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.toLowerCase().startsWith("on")) {
        element.removeAttribute(attribute.name)
      }
    }
  }
}

function decodeSvgDataUrl(value) {
  const match = String(value || "").match(/^data:image\\/svg\\+xml(?:;charset=[^;,]+)?(;base64)?,(.*)$/i)
  if (!match) return null
  try {
    if (match[1]) {
      const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0))
      return new TextDecoder().decode(bytes)
    }
    return decodeURIComponent(match[2])
  } catch {
    return null
  }
}

function inlineEmbeddedSvgs(svg, linkIndex) {
  for (const image of [...svg.querySelectorAll("image")]) {
    const source = decodeSvgDataUrl(image.getAttribute("href") || image.getAttribute("xlink:href"))
    if (!source) continue

    const parsed = new DOMParser().parseFromString(source, "image/svg+xml")
    const embedded = parsed.documentElement
    if (embedded.localName !== "svg" || parsed.querySelector("parsererror")) continue
    sanitizeSvg(embedded)
    rewriteSvgLinks(embedded, linkIndex)

    const replacement = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    for (const name of ["x", "y", "width", "height", "preserveAspectRatio", "transform"]) {
      if (image.hasAttribute(name)) replacement.setAttribute(name, image.getAttribute(name))
    }
    const viewBox = embedded.getAttribute("viewBox")
    if (viewBox) replacement.setAttribute("viewBox", viewBox)
    else {
      const width = parseFloat(embedded.getAttribute("width"))
      const height = parseFloat(embedded.getAttribute("height"))
      if (Number.isFinite(width) && Number.isFinite(height)) {
        replacement.setAttribute("viewBox", "0 0 " + width + " " + height)
      }
    }
    if (!replacement.hasAttribute("preserveAspectRatio")) {
      replacement.setAttribute("preserveAspectRatio", "none")
    }
    for (const child of [...embedded.childNodes]) {
      replacement.appendChild(document.importNode(child, true))
    }
    image.replaceWith(replacement)
  }
}

function inlineLinkedUses(svg) {
  for (const use of [...svg.querySelectorAll("use")]) {
    const href = use.getAttribute("href") || use.getAttribute("xlink:href") || ""
    if (!href.startsWith("#")) continue
    const referenced = svg.querySelector("#" + CSS.escape(href.slice(1)))
    if (!referenced || referenced.localName !== "symbol" || !referenced.querySelector("a[href]")) {
      continue
    }

    const replacement = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    for (const name of ["x", "y", "width", "height", "preserveAspectRatio", "transform", "style", "class"]) {
      if (use.hasAttribute(name)) replacement.setAttribute(name, use.getAttribute(name))
    }
    if (referenced.hasAttribute("viewBox")) {
      replacement.setAttribute("viewBox", referenced.getAttribute("viewBox"))
    }
    if (!replacement.hasAttribute("preserveAspectRatio")) {
      replacement.setAttribute("preserveAspectRatio", "none")
    }
    for (const child of [...referenced.childNodes]) {
      replacement.appendChild(document.importNode(child, true))
    }
    use.replaceWith(replacement)
  }
}

function rewriteSvgLinks(svg, linkIndex) {
  for (const link of svg.querySelectorAll("a[href], a[xlink\\\\:href]")) {
    const href = link.getAttribute("href") || link.getAttribute("xlink:href") || ""
    if (/^(?:https?:|mailto:|tel:|#)/i.test(href)) {
      if (/^https?:/i.test(href)) {
        link.setAttribute("target", "_blank")
        link.setAttribute("rel", "noopener noreferrer")
      }
      continue
    }

    const slug = linkIndex.get(normalizeLinkKey(href))
    if (!slug) {
      link.removeAttribute("href")
      link.removeAttribute("xlink:href")
      link.classList.add("is-unresolved")
      continue
    }
    link.setAttribute("href", pageUrl(slug))
    link.removeAttribute("xlink:href")
    link.removeAttribute("target")
    link.removeAttribute("rel")
    link.classList.add("internal")
  }
}

async function setupSvgViewer(object) {
  object.dataset.svgViewerReady = "true"

  const viewer = document.createElement("div")
  viewer.className = "svg-viewer is-loading"
  viewer.tabIndex = 0
  viewer.setAttribute("role", "region")
  viewer.setAttribute("aria-label", "Interaktiver SVG-Viewer")

  const stage = document.createElement("div")
  stage.className = "svg-viewer-stage"

  const toolbar = document.createElement("div")
  toolbar.className = "svg-viewer-toolbar"
  toolbar.setAttribute("aria-label", "SVG-Steuerung")

  const controls = [
    ["minus", "−", "Verkleinern"],
    ["reset", "1:1", "Ansicht zurücksetzen"],
    ["plus", "+", "Vergrößern"],
    ["fullscreen", "⛶", "Canvas groß anzeigen"],
    ["close", "×", "Große Ansicht schließen"],
  ]

  for (const [action, label, title] of controls) {
    const button = document.createElement("button")
    button.type = "button"
    button.dataset.svgViewerAction = action
    button.textContent = label
    button.title = title
    button.setAttribute("aria-label", title)
    toolbar.append(button)
  }

  const hint = document.createElement("span")
  hint.className = "svg-viewer-hint"
  hint.textContent = "Ziehen zum Verschieben · Scrollen zum Zoomen"

  object.parentNode.insertBefore(viewer, object)
  stage.append(object)
  viewer.append(stage, toolbar, hint)

  let svg
  try {
    const response = await fetch(object.data)
    if (!response.ok) throw new Error("SVG konnte nicht geladen werden")
    const source = await response.text()
    const document = new DOMParser().parseFromString(source, "image/svg+xml")
    svg = document.documentElement
    if (svg.localName !== "svg" || document.querySelector("parsererror")) {
      throw new Error("Ungültiges SVG")
    }

    sanitizeSvg(svg)
    const linkIndex = await getSvgLinkIndex()
    inlineEmbeddedSvgs(svg, linkIndex)
    rewriteSvgLinks(svg, linkIndex)
    inlineLinkedUses(svg)

    svg = window.document.importNode(svg, true)
    svg.removeAttribute("width")
    svg.removeAttribute("height")
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet")
    svg.classList.add("svg-viewer-image")
    stage.replaceChildren(svg)
  } catch (error) {
    viewer.classList.remove("is-loading")
    viewer.classList.add("has-error")
    return
  }

  const values = (svg.getAttribute("viewBox") || "")
    .trim()
    .split(/[\\s,]+/)
    .map(Number)
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    viewer.classList.remove("is-loading")
    viewer.classList.add("has-error")
    return
  }

  const initial = { x: values[0], y: values[1], width: values[2], height: values[3] }
  let viewBox = { ...initial }
  let dragging = false
  let pointerId = null
  let startX = 0
  let startY = 0
  let originX = 0
  let originY = 0
  let moved = false

  const applyViewBox = () => {
    svg.setAttribute(
      "viewBox",
      [viewBox.x, viewBox.y, viewBox.width, viewBox.height].join(" "),
    )
    viewer.classList.toggle("is-zoomed", viewBox.width < initial.width - 0.001)
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
    const nextScale = Math.min(16, Math.max(1, currentScale * factor))
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

  const setExpanded = (expanded) => {
    viewer.classList.toggle("is-expanded", expanded)
    document.documentElement.classList.toggle("svg-viewer-expanded", expanded)
    viewer.setAttribute("aria-label", expanded ? "Großer interaktiver SVG-Viewer" : "Interaktiver SVG-Viewer")
    if (expanded) viewer.focus({ preventScroll: true })
  }

  toolbar.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-svg-viewer-action]")
    if (!button) return

    const rect = stage.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const action = button.dataset.svgViewerAction

    if (action === "minus") zoomAt(1 / 1.3, centerX, centerY)
    if (action === "plus") zoomAt(1.3, centerX, centerY)
    if (action === "reset") reset()
    if (action === "fullscreen") setExpanded(!viewer.classList.contains("is-expanded"))
    if (action === "close") setExpanded(false)
  })

  stage.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault()
      zoomAt(Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY)
    },
    { passive: false },
  )

  stage.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]")
    if (link) {
      event.preventDefault()

      const href = link.getAttribute("href")
      if (!href) return
      const openInNewTab =
        link.getAttribute("target") === "_blank" ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey
      if (openInNewTab) window.open(href, "_blank", "noopener,noreferrer")
      else window.location.href = href
      return
    }

    if (moved || viewer.classList.contains("is-expanded")) return
    setExpanded(true)
  })

  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return
    if (event.target.closest("a[href]")) return
    dragging = true
    pointerId = event.pointerId
    startX = event.clientX
    startY = event.clientY
    originX = viewBox.x
    originY = viewBox.y
    moved = false
    stage.setPointerCapture(pointerId)
    viewer.classList.add("is-dragging")
  })

  stage.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId) return
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 4) moved = true
    const rect = stage.getBoundingClientRect()
    const unitsPerPixel = Math.max(viewBox.width / rect.width, viewBox.height / rect.height)
    viewBox.x = originX - (event.clientX - startX) * unitsPerPixel
    viewBox.y = originY - (event.clientY - startY) * unitsPerPixel
    applyViewBox()
  })

  const stopDragging = (event) => {
    if (!dragging || event.pointerId !== pointerId) return
    dragging = false
    pointerId = null
    viewer.classList.remove("is-dragging")
  }

  stage.addEventListener("pointerup", stopDragging)
  stage.addEventListener("pointercancel", stopDragging)
  stage.addEventListener("dblclick", reset)
  viewer.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && viewer.classList.contains("is-expanded")) {
      event.preventDefault()
      setExpanded(false)
    }
  })
  viewer.classList.remove("is-loading")
  applyViewBox()
}

function initializeSvgViewers() {
  const objects = document.querySelectorAll(
    'article object[type="image/svg+xml"]:not([data-svg-viewer-ready])',
  )

  for (const object of objects) {
    const data = object.getAttribute("data") || ""
    const isExcalidrawSvg =
      data.includes("static/excalidraw/") ||
      new RegExp("\\\\.excalidraw(?:\\\\.|$)", "i").test(data)
    if (!isExcalidrawSvg) {
      continue
    }
    setupSvgViewer(object)
  }
}

document.addEventListener("nav", initializeSvgViewers)
document.addEventListener("render", initializeSvgViewers)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeSvgViewers, { once: true })
} else {
  initializeSvgViewers()
}
`

const viewerStyle = `
.svg-viewer {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: min(72vh, 760px);
  min-height: 360px;
  margin: 1rem 0 1.5rem;
  overflow: hidden;
  border: 1px solid var(--lightgray);
  border-radius: 0.7rem;
  background: var(--light);
  box-shadow: 0 0.25rem 1rem color-mix(in srgb, var(--dark) 8%, transparent);
}

html.svg-viewer-expanded,
html.svg-viewer-expanded body {
  overflow: hidden;
}

.svg-viewer:focus-visible {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.svg-viewer-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.svg-viewer.is-dragging .svg-viewer-stage {
  cursor: grabbing;
}

.svg-viewer:not(.is-expanded) .svg-viewer-stage::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  background: color-mix(in srgb, var(--secondary) 8%, transparent);
  transition: opacity 160ms ease;
}

.svg-viewer:not(.is-expanded) .svg-viewer-stage:hover::after {
  opacity: 1;
}

.svg-viewer object[type="image/svg+xml"],
.svg-viewer-image {
  display: block;
  width: 100%;
  height: 100%;
  max-width: none;
  margin: 0;
  border: 0;
  pointer-events: auto;
}

.svg-viewer-image a[href] {
  cursor: pointer;
}

.svg-viewer-image a[href]:hover {
  filter: brightness(1.18);
}

.svg-viewer-image a.is-unresolved {
  cursor: not-allowed;
}

:root[saved-theme="dark"] .svg-viewer-image {
  filter: invert(1) hue-rotate(180deg);
}

.svg-viewer.is-loading::before,
.svg-viewer.has-error::before {
  position: absolute;
  z-index: 3;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  color: var(--darkgray);
  font-size: 0.85rem;
}

.svg-viewer.is-loading::before {
  content: "SVG wird geladen …";
}

.svg-viewer.has-error::before {
  content: "SVG konnte nicht geladen werden";
}

.svg-viewer-toolbar {
  position: absolute;
  z-index: 2;
  top: 0.65rem;
  right: 0.65rem;
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  border: 1px solid color-mix(in srgb, var(--dark) 14%, transparent);
  border-radius: 0.55rem;
  background: color-mix(in srgb, var(--light) 90%, transparent);
  box-shadow: 0 0.2rem 0.8rem color-mix(in srgb, var(--dark) 12%, transparent);
  backdrop-filter: blur(8px);
}

.svg-viewer-toolbar button {
  min-width: 2.25rem;
  height: 2.1rem;
  margin: 0;
  padding: 0 0.55rem;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  color: var(--dark);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 650;
  cursor: pointer;
}

.svg-viewer-toolbar button:hover,
.svg-viewer-toolbar button:focus-visible {
  background: var(--highlight);
  color: var(--secondary);
  outline: none;
}

.svg-viewer:not(.is-expanded) [data-svg-viewer-action="close"] {
  display: none;
}

.svg-viewer-hint {
  position: absolute;
  z-index: 2;
  left: 0.75rem;
  bottom: 0.65rem;
  padding: 0.3rem 0.5rem;
  border-radius: 0.35rem;
  background: color-mix(in srgb, var(--light) 88%, transparent);
  color: var(--darkgray);
  font-size: 0.75rem;
  pointer-events: none;
  backdrop-filter: blur(8px);
  transition: opacity 180ms ease;
}

.svg-viewer.is-zoomed .svg-viewer-hint,
.svg-viewer.is-dragging .svg-viewer-hint {
  opacity: 0;
}

.svg-viewer.is-expanded {
  position: fixed;
  z-index: 9999;
  inset: 0;
  width: auto;
  height: auto;
  min-height: 0;
  max-width: none;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: var(--light);
  box-shadow: none;
}

.svg-viewer.is-expanded .svg-viewer-toolbar {
  top: 1rem;
  right: 1rem;
}

.svg-viewer.is-expanded .svg-viewer-hint {
  left: 1rem;
  bottom: 1rem;
  opacity: 1;
}

@media (max-width: 600px) {
  .svg-viewer {
    height: 62vh;
    min-height: 300px;
  }

  .svg-viewer-hint {
    display: none;
  }
}
`

export default function SvgViewer() {
  return {
    name: "SvgViewer",
    htmlPlugins() {
      return [normalizeSvgObjectEmbeds]
    },
    externalResources() {
      return {
        js: [
          {
            script: viewerScript,
            loadTime: "afterDOMReady",
            contentType: "inline",
          },
        ],
        css: [
          {
            content: viewerStyle,
            inline: true,
          },
        ],
      }
    },
  }
}
