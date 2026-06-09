import { h } from "preact"

const defaultOptions = {
  defaultDepth: 2,
  height: 520,
  showSiblings: false,
}

function classNames(...classes) {
  return classes.filter(Boolean).join(" ")
}

const script = `
(() => {
  const depthStorageKey = "structured-brain-depth-v3"
  const relationLabels = {
    parent: "Parent",
    child: "Child",
    prev: "Prev",
    next: "Next",
    friend: "Friend",
    sibling: "Sibling",
  }
  const relationClasses = new Set(["parent", "child", "prev", "next", "friend", "sibling"])

  function trimSlashes(value) {
    return String(value || "").replace(/^\\/+|\\/+$/g, "")
  }

  function currentPath() {
    let path = trimSlashes(window.location.pathname)
    const base = trimSlashes(document.body?.dataset?.basepath || "")
    if (base && path.startsWith(base)) path = trimSlashes(path.slice(base.length))
    return path || "index"
  }

  function normalizeSlug(value) {
    let slug = String(value || "")
    try {
      slug = decodeURIComponent(slug)
    } catch {}
    slug = slug.replace(/^https?:\\/\\/[^/]+/i, "").split(/[?#]/)[0] || ""
    slug = trimSlashes(slug.replace(/\\.html$/i, ""))
    if (slug.endsWith("/index")) slug = slug.slice(0, -"index".length - 1)
    return slug || "index"
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

  function resolveSlug(candidate, validSlugs) {
    let slug = normalizeSlug(candidate)
    if (validSlugs.has(slug)) return slug
    const parts = slug.split("/")
    for (let i = 1; i < parts.length; i++) {
      const suffix = parts.slice(i).join("/")
      if (validSlugs.has(suffix)) return suffix
    }
    return slug
  }

  function svgEl(name, attrs = {}) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name)
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== undefined && value !== null) el.setAttribute(key, String(value))
    }
    return el
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild)
  }

  function truncate(text, max = 42) {
    const value = String(text || "")
    return value.length > max ? value.slice(0, max - 3) + "..." : value
  }

  function pickDepth(config) {
    const saved = Number(localStorage.getItem(depthStorageKey))
    if ([1, 2, 3].includes(saved)) return saved
    return Number(config.defaultDepth || 2)
  }

  function pickSiblings(config) {
    return config.showSiblings === true
  }

  function outgoingByNode(edges, includeSiblings) {
    const map = new Map()
    for (const edge of edges) {
      if (!includeSiblings && edge.type === "sibling") continue
      if (!map.has(edge.from)) map.set(edge.from, [])
      map.get(edge.from).push(edge)
    }
    return map
  }

  function collectVisible(center, index, depth, includeSiblings) {
    const valid = new Set(Object.keys(index.nodes || {}))
    const outgoing = outgoingByNode(index.edges || [], includeSiblings)
    const visible = new Set([center])
    const levels = new Map([[center, 0]])
    let frontier = [center]

    for (let level = 0; level < depth && frontier.length; level++) {
      const next = []
      for (const slug of frontier) {
        for (const edge of outgoing.get(slug) || []) {
          if (!valid.has(edge.to)) continue
          if (!visible.has(edge.to)) {
            visible.add(edge.to)
            levels.set(edge.to, level + 1)
            next.push(edge.to)
          }
        }
      }
      frontier = next
    }

    const edges = (index.edges || []).filter(
      (edge) =>
        visible.has(edge.from) &&
        visible.has(edge.to) &&
        (includeSiblings || edge.type !== "sibling"),
    )

    return { visible, levels, edges, outgoing }
  }

  function centeredEdges(center, edges) {
    const result = {}
    for (const type of relationClasses) result[type] = []
    for (const edge of edges) {
      if (edge.from !== center || !relationClasses.has(edge.type)) continue
      result[edge.type].push(edge.to)
    }
    for (const type of relationClasses) result[type] = [...new Set(result[type])]
    return result
  }

  function spread(items, y, minX, maxX) {
    const result = new Map()
    if (!items.length) return result
    const step = (maxX - minX) / (items.length + 1)
    items.forEach((slug, index) => result.set(slug, { x: minX + step * (index + 1), y }))
    return result
  }

  function layoutNodes(center, index, visible, edges, levels, width, height) {
    const positions = new Map([[center, { x: width / 2, y: height / 2, role: "center" }]])
    const grouped = centeredEdges(center, edges)
    const placeGroup = (type, y, minX, maxX) => {
      for (const [slug, pos] of spread(grouped[type] || [], y, minX, maxX)) {
        if (!positions.has(slug)) positions.set(slug, { ...pos, role: type })
      }
    }

    placeGroup("parent", height * 0.18, width * 0.18, width * 0.82)
    placeGroup("child", height * 0.82, width * 0.18, width * 0.82)
    placeGroup("prev", height * 0.5, width * 0.04, width * 0.28)
    placeGroup("next", height * 0.5, width * 0.72, width * 0.96)
    placeGroup("friend", height * 0.66, width * 0.14, width * 0.86)
    placeGroup("sibling", height * 0.34, width * 0.14, width * 0.86)

    const outer = [...visible].filter((slug) => !positions.has(slug))
    const radius = Math.min(width, height) * 0.42
    outer.forEach((slug, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(outer.length, 1)
      positions.set(slug, {
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        role: "outer",
      })
    })

    return positions
  }

  function relationPriority(edge) {
    return ["parent", "child", "prev", "next", "friend", "sibling"].indexOf(edge.type)
  }

  function bestEdgeBetween(edges, from, to) {
    return edges
      .filter((edge) => edge.from === from && edge.to === to)
      .sort((a, b) => relationPriority(a) - relationPriority(b))[0]
  }

  function displayEdges(edges, center) {
    const byPair = new Map()
    for (const edge of edges) {
      if (edge.type === "sibling" && edge.from !== center && edge.to !== center) continue
      const key = [edge.from, edge.to].sort().join("\\u0000")
      const current = byPair.get(key)
      if (!current) {
        byPair.set(key, edge)
        continue
      }
      const edgeTouchesCenter = edge.from === center || edge.to === center
      const currentTouchesCenter = current.from === center || current.to === center
      if (edge.from === center && current.from !== center) byPair.set(key, edge)
      else if (edgeTouchesCenter && !currentTouchesCenter) byPair.set(key, edge)
      else if (relationPriority(edge) < relationPriority(current)) byPair.set(key, edge)
    }
    return [...byPair.values()]
  }

  function installPanZoom(svg, viewport, width, height) {
    const state = { x: 0, y: 0, k: 1 }
    let drag = null

    function apply() {
      viewport.setAttribute("transform", "translate(" + state.x + " " + state.y + ") scale(" + state.k + ")")
    }

    function point(event) {
      const rect = svg.getBoundingClientRect()
      return {
        x: ((event.clientX - rect.left) / rect.width) * width,
        y: ((event.clientY - rect.top) / rect.height) * height,
      }
    }

    svg.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault()
        const p = point(event)
        const nextK = Math.max(0.45, Math.min(4, state.k * Math.exp(-event.deltaY * 0.0014)))
        state.x = p.x - (p.x - state.x) * (nextK / state.k)
        state.y = p.y - (p.y - state.y) * (nextK / state.k)
        state.k = nextK
        apply()
      },
      { passive: false },
    )

    svg.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".structured-brain-node")) return
      svg.setPointerCapture(event.pointerId)
      drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: state.x, y: state.y }
      svg.classList.add("is-panning")
    })

    svg.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return
      const rect = svg.getBoundingClientRect()
      state.x = drag.x + ((event.clientX - drag.startX) / rect.width) * width
      state.y = drag.y + ((event.clientY - drag.startY) / rect.height) * height
      apply()
    })

    function stop(event) {
      if (!drag || drag.id !== event.pointerId) return
      drag = null
      svg.classList.remove("is-panning")
    }

    svg.addEventListener("pointerup", stop)
    svg.addEventListener("pointercancel", stop)
    apply()
  }

  function draw(container, index, currentSlug, config) {
    clear(container)
    const validSlugs = new Set(Object.keys(index.nodes || {}))
    const center = resolveSlug(currentSlug, validSlugs)
    const node = index.nodes?.[center]

    if (!node) {
      container.textContent = "Keine Struktur fuer diesen Zettel gefunden."
      return
    }

    const depth = pickDepth(config)
    const includeSiblings = pickSiblings(config)
    const width = Math.max(container.clientWidth || 320, 320)
    const height = Math.max(Number(config.height || 300), 260)
    const { visible, levels, edges } = collectVisible(center, index, depth, includeSiblings)
    const positions = layoutNodes(center, index, visible, edges, levels, width, height)
    const svg = svgEl("svg", {
      viewBox: "0 0 " + width + " " + height,
      class: "structured-brain-svg",
      role: "img",
      "aria-label": "Strukturansicht fuer " + node.title,
    })

    const defs = svgEl("defs")
    const marker = svgEl("marker", {
      id: "brain-arrow",
      viewBox: "0 0 10 10",
      refX: 9,
      refY: 5,
      markerWidth: 5,
      markerHeight: 5,
      orient: "auto-start-reverse",
    })
    marker.appendChild(svgEl("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "structured-brain-arrow" }))
    defs.appendChild(marker)
    svg.appendChild(defs)
    const viewport = svgEl("g", { class: "structured-brain-viewport" })
    svg.appendChild(viewport)

    const drawn = new Set()
    for (const edge of displayEdges(edges, center)) {
      if (!positions.has(edge.from) || !positions.has(edge.to)) continue
      const key = [edge.from, edge.to].sort().join("\\u0000")
      if (drawn.has(key)) continue
      drawn.add(key)
      const best = edge.from === center ? edge : bestEdgeBetween(edges, edge.from, edge.to) || edge
      const from = positions.get(best.from)
      const to = positions.get(best.to)
      const line = svgEl("line", {
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        class: "structured-brain-edge " + best.type + (best.explicit ? " explicit" : " inferred"),
      })
      if (["parent", "child", "prev", "next"].includes(best.type)) {
        line.setAttribute("marker-end", "url(#brain-arrow)")
      }
      viewport.appendChild(line)
    }

    for (const slug of visible) {
      const pos = positions.get(slug)
      const data = index.nodes[slug]
      if (!pos || !data) continue
      const title = data.title || slug
      const label = truncate(title, slug === center ? 50 : 34)
      const group = svgEl("g", {
        class: "structured-brain-node " + (pos.role || "outer") + (slug === center ? " active" : ""),
        tabindex: "0",
        role: "link",
        "aria-label": title,
      })
      const textWidth = Math.max(88, Math.min(270, label.length * (slug === center ? 9 : 7.5) + 26))
      const textHeight = slug === center ? 34 : 28
      group.appendChild(
        svgEl("rect", {
          x: pos.x - textWidth / 2,
          y: pos.y - textHeight / 2,
          width: textWidth,
          height: textHeight,
          rx: 5,
          ry: 5,
        }),
      )
      const text = svgEl("text", {
        x: pos.x,
        y: pos.y + (slug === center ? 5 : 4),
        "text-anchor": "middle",
      })
      text.textContent = label
      group.appendChild(text)
      group.addEventListener("click", () => {
        window.location.href = pageUrl(slug)
      })
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          window.location.href = pageUrl(slug)
        }
      })
      viewport.appendChild(group)
    }

    installPanZoom(svg, viewport, width, height)
    container.appendChild(svg)
  }

  let indexPromise
  function getIndex() {
    if (!indexPromise) {
      indexPromise = fetch(staticUrl("brain-index.json")).then((res) => {
        if (!res.ok) throw new Error("brain-index.json konnte nicht geladen werden")
        return res.json()
      })
    }
    return indexPromise
  }

  function updateButtons(root, depth, siblings) {
    for (const button of root.querySelectorAll(".structured-brain-depth button")) {
      const active = Number(button.dataset.depth) === depth
      button.classList.toggle("active", active)
      button.setAttribute("aria-pressed", String(active))
    }
  }

  async function renderAll() {
    const panels = [...document.querySelectorAll(".structured-brain")]
    if (!panels.length) return
    let index
    try {
      index = await getIndex()
    } catch (error) {
      console.error("[StructuredBrain]", error)
      for (const panel of panels) {
        const canvas = panel.querySelector(".structured-brain-canvas")
        if (canvas) canvas.textContent = "Strukturindex konnte nicht geladen werden."
      }
      return
    }

    const current = normalizeSlug(document.body?.dataset?.slug || currentPath())
    for (const panel of panels) {
      const canvas = panel.querySelector(".structured-brain-canvas")
      if (!canvas) continue
      const config = JSON.parse(canvas.dataset.cfg || "{}")
      updateButtons(panel, pickDepth(config), pickSiblings(config))
      draw(canvas, index, current, config)
    }
  }

  function bindControls() {
    for (const panel of document.querySelectorAll(".structured-brain")) {
      const fullscreen = panel.querySelector(".structured-brain-fullscreen")
      const close = panel.querySelector(".structured-brain-close")
      const modal = panel.querySelector(".structured-brain-modal")
      if (fullscreen && modal) fullscreen.onclick = () => {
        modal.classList.add("active")
        renderAll()
      }
      if (close && modal) close.onclick = () => {
        modal.classList.remove("active")
      }
      for (const button of panel.querySelectorAll(".structured-brain-depth button")) {
        button.onclick = () => {
          localStorage.setItem(depthStorageKey, String(button.dataset.depth))
          renderAll()
        }
      }
    }
  }

  function boot() {
    bindControls()
    renderAll()
  }

  document.addEventListener("nav", boot)
  document.addEventListener("render", boot)
  document.addEventListener("themechange", renderAll)
  window.addEventListener("resize", renderAll)
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot)
  else boot()
})()
`

export default function StructuredBrain(userOpts = {}) {
  const options = { ...defaultOptions, ...userOpts }
  const depthOptions = [1, 2, 3]

  const Component = ({ displayClass }) =>
    h(
      "section",
      { class: classNames(displayClass, "structured-brain") },
      h(
        "div",
        { class: "structured-brain-header" },
        h("h3", null, "Strukturansicht"),
        h(
          "button",
          { class: "structured-brain-fullscreen", type: "button", title: "Gross oeffnen" },
          "[]",
        ),
      ),
      h(
        "div",
        { class: "structured-brain-controls" },
        h(
          "div",
          { class: "structured-brain-depth", role: "group", "aria-label": "Struktur-Tiefe" },
          h("span", null, "Tiefe"),
          ...depthOptions.map((depth) =>
            h(
              "button",
              {
                type: "button",
                "data-depth": depth,
                class: options.defaultDepth === depth ? "active" : undefined,
                "aria-pressed": options.defaultDepth === depth ? "true" : "false",
              },
              String(depth),
            ),
          ),
        ),
      ),
      h("div", {
        class: "structured-brain-canvas",
        "data-cfg": JSON.stringify(options),
        style: `height: ${Number(options.height || 520)}px`,
      }),
      h(
        "div",
        { class: "structured-brain-modal", role: "dialog", "aria-modal": "true" },
        h(
          "div",
          { class: "structured-brain-modal-inner" },
          h(
            "div",
            { class: "structured-brain-modal-bar" },
            h("strong", null, "Strukturansicht"),
            h("button", { class: "structured-brain-close", type: "button" }, "Schliessen"),
          ),
          h("div", {
            class: "structured-brain-canvas",
            "data-cfg": JSON.stringify({ ...options, height: 760 }),
            style: "height: 76vh",
          }),
        ),
      ),
    )

  Component.css = `
.structured-brain {
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  margin: 0.8rem 0 1.4rem;
  overflow: hidden;
  background: color-mix(in srgb, var(--light) 96%, var(--secondary));
}

.structured-brain-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  padding: 0.65rem 0.75rem 0.35rem;
}

.structured-brain-header h3 {
  font-size: 1rem;
  margin: 0;
}

.structured-brain-fullscreen,
.structured-brain-close,
.structured-brain-depth button {
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--darkgray);
  cursor: pointer;
  font: inherit;
}

.structured-brain-fullscreen:hover,
.structured-brain-close:hover,
.structured-brain-depth button:hover {
  background: var(--lightgray);
}

.structured-brain-controls {
  align-items: center;
  display: flex;
  gap: 0.7rem;
  justify-content: space-between;
  padding: 0 0.75rem 0.45rem;
}

.structured-brain-depth {
  align-items: center;
  color: var(--gray);
  display: flex;
  font-size: 0.75rem;
  gap: 0.25rem;
}

.structured-brain-depth button {
  height: 1.45rem;
  min-width: 1.45rem;
  padding: 0 0.3rem;
}

.structured-brain-depth button.active {
  background: var(--highlight);
  border-color: var(--secondary);
  color: var(--secondary);
  font-weight: 700;
}

.structured-brain-canvas {
  border-top: 1px solid var(--lightgray);
  color: var(--gray);
  min-height: 420px;
  overflow: hidden;
}

.structured-brain-svg {
  cursor: grab;
  display: block;
  height: 100%;
  touch-action: none;
  width: 100%;
}

.structured-brain-svg.is-panning {
  cursor: grabbing;
}

.structured-brain-edge {
  stroke: color-mix(in srgb, var(--gray) 55%, transparent);
  stroke-width: 1.2;
}

.structured-brain-edge.parent,
.structured-brain-edge.child {
  stroke: var(--secondary);
}

.structured-brain-edge.prev,
.structured-brain-edge.next {
  stroke: var(--tertiary);
}

.structured-brain-edge.friend {
  stroke: color-mix(in srgb, var(--secondary) 55%, var(--tertiary));
}

.structured-brain-edge.sibling {
  stroke-dasharray: 5 5;
}

.structured-brain-edge.inferred {
  opacity: 0.55;
}

.structured-brain-arrow {
  fill: var(--gray);
}

.structured-brain-node {
  cursor: pointer;
  outline: none;
}

.structured-brain-node rect {
  fill: color-mix(in srgb, var(--light) 88%, white);
  stroke: var(--lightgray);
  stroke-width: 1.2;
}

.structured-brain-node text {
  fill: var(--dark);
  font-family: var(--bodyFont);
  font-size: 12px;
  font-weight: 700;
  pointer-events: none;
}

.structured-brain-node.active rect {
  fill: color-mix(in srgb, var(--secondary) 18%, var(--light));
  stroke: var(--secondary);
  stroke-width: 2;
}

.structured-brain-node.active text {
  font-size: 15px;
}

.structured-brain-node.parent rect,
.structured-brain-node.child rect {
  stroke: var(--secondary);
}

.structured-brain-node.prev rect,
.structured-brain-node.next rect {
  stroke: var(--tertiary);
}

.structured-brain-node.friend rect {
  stroke: color-mix(in srgb, var(--secondary) 55%, var(--tertiary));
}

.structured-brain-modal {
  backdrop-filter: blur(4px);
  background: color-mix(in srgb, var(--light) 36%, transparent);
  display: none;
  inset: 0;
  position: fixed;
  z-index: 10000;
}

.structured-brain-modal.active {
  display: block;
}

.structured-brain-modal-inner {
  background: var(--light);
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  box-shadow: 0 14px 40px color-mix(in srgb, var(--dark) 18%, transparent);
  box-sizing: border-box;
  left: 50%;
  max-width: 1280px;
  position: fixed;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(92vw, 1280px);
}

.structured-brain-modal-bar {
  align-items: center;
  border-bottom: 1px solid var(--lightgray);
  display: flex;
  justify-content: space-between;
  padding: 0.7rem 0.85rem;
}
`

  Component.afterDOMLoaded = script
  return Component
}
