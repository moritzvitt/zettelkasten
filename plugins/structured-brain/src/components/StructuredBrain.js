import { h } from "preact"

const defaultOptions = {
  height: 620,
}

function classNames(...classes) {
  return classes.filter(Boolean).join(" ")
}

const script = `
(() => {
  const friendsStorageKey = "structured-brain-show-friends-v1"
  const inferredStorageKey = "structured-brain-show-inferred-v1"
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

  function wrapLabel(text, maxLine = 30, maxLines = 2) {
    const words = String(text || "").replace(/\\s+/g, " ").trim().split(" ")
    const lines = []
    let current = ""
    for (const word of words) {
      const next = current ? current + " " + word : word
      if (next.length <= maxLine) {
        current = next
      } else {
        if (current) lines.push(current)
        current = word
      }
      if (lines.length === maxLines) break
    }
    if (lines.length < maxLines && current) lines.push(current)
    const original = String(text || "")
    const joined = lines.join(" ")
    if (joined.length < original.length && lines.length) {
      lines[lines.length - 1] = lines[lines.length - 1].replace(/\\.{3}$/, "")
      if (lines[lines.length - 1].length > maxLine - 3) {
        lines[lines.length - 1] = lines[lines.length - 1].slice(0, maxLine - 3)
      }
      lines[lines.length - 1] += "..."
    }
    return lines.length ? lines : [original]
  }

  function storedToggle(key) {
    return localStorage.getItem(key) === "true"
  }

  function relationVisible(edge, showFriends, showInferred) {
    if (edge.type === "friend" && !showFriends) return false
    if (edge.type === "sibling" && !showInferred) return false
    if (!edge.explicit && !showInferred) return false
    return ["parent", "child", "prev", "next", "friend", "sibling"].includes(edge.type)
  }

  function outgoingByNode(edges) {
    const map = new Map()
    for (const edge of edges) {
      if (!map.has(edge.from)) map.set(edge.from, [])
      map.get(edge.from).push(edge)
    }
    return map
  }

  function collectVisible(center, index, showFriends, showInferred) {
    const valid = new Set(Object.keys(index.nodes || {}))
    const filteredEdges = (index.edges || []).filter((edge) =>
      relationVisible(edge, showFriends, showInferred),
    )
    const outgoing = outgoingByNode(filteredEdges)
    const visible = new Set([center])
    const levels = new Map([[center, 0]])
    const centerEdges = outgoing.get(center) || []
    for (const edge of centerEdges) {
      if (!valid.has(edge.to)) continue
      if (!visible.has(edge.to)) {
        visible.add(edge.to)
        levels.set(edge.to, 1)
      }
    }

    const siblingLinks = centerEdges.filter((edge) => edge.type === "sibling" && edge.via)
    for (const edge of siblingLinks) {
      if (!valid.has(edge.via)) continue
      visible.add(edge.via)
      if (!levels.has(edge.via)) levels.set(edge.via, 1)
    }

    const siblingSupportPairs = new Set(
      siblingLinks.map((edge) => [edge.via, edge.to].sort().join("\\u0000")),
    )
    const edges = filteredEdges.filter((edge) => {
      if (!visible.has(edge.from) || !visible.has(edge.to)) return false
      if (edge.from === center || edge.to === center) return true
      return siblingSupportPairs.has([edge.from, edge.to].sort().join("\\u0000"))
    })

    return { visible, levels, edges, outgoing }
  }

  function nodeGeometry(slug, center, index) {
    const data = index.nodes[slug]
    const title = data?.title || slug
    const lines = wrapLabel(title, slug === center ? 38 : 30, 2)
    const longest = lines.reduce((max, line) => Math.max(max, line.length), 0)
    const width = Math.max(
      104,
      Math.min(slug === center ? 360 : 300, longest * (slug === center ? 8.8 : 7.2) + 28),
    )
    const lineHeight = slug === center ? 16 : 14
    const height = Math.max(slug === center ? 38 : 30, lines.length * lineHeight + 14)
    return { title, lines, width, height, lineHeight }
  }

  function portFor(node, relationType, otherNode, inverse = false) {
    let side
    if (relationType === "parent") side = "top"
    else if (relationType === "child") side = "bottom"
    else if (relationType === "prev") side = "left"
    else if (relationType === "next") side = "right"
    else side = otherNode.x < node.x ? "left" : "right"

    if (inverse) {
      side = { top: "bottom", bottom: "top", left: "right", right: "left" }[side]
    }

    if (side === "top") return { x: node.x, y: node.y - node.height / 2, side }
    if (side === "bottom") return { x: node.x, y: node.y + node.height / 2, side }
    if (side === "left") return { x: node.x - node.width / 2, y: node.y, side }
    return { x: node.x + node.width / 2, y: node.y, side }
  }

  function portPosition(node, side) {
    if (side === "top") return { x: node.x, y: node.y - node.height / 2 }
    if (side === "bottom") return { x: node.x, y: node.y + node.height / 2 }
    if (side === "left") return { x: node.x - node.width / 2, y: node.y }
    return { x: node.x + node.width / 2, y: node.y }
  }

  function portRelationClass(side, role) {
    if (role === "center") {
      return { top: "parent", bottom: "child", left: "prev", right: "next" }[side]
    }
    if (["parent", "child", "prev", "next", "friend", "sibling"].includes(role)) {
      return role
    }
    return ""
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
    const available = maxX - minX
    const columns = Math.max(1, Math.min(items.length, Math.floor(available / 230)))
    const rows = Math.ceil(items.length / columns)
    const rowGap = 58
    const colGap = columns === 1 ? 0 : available / (columns - 1)
    items.forEach((slug, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      const x = columns === 1 ? (minX + maxX) / 2 : minX + column * colGap
      const offsetY = (row - (rows - 1) / 2) * rowGap
      result.set(slug, { x, y: y + offsetY })
    })
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

    placeGroup("parent", height * 0.16, width * 0.2, width * 0.8)
    placeGroup("child", height * 0.88, width * 0.2, width * 0.8)
    placeGroup("prev", height * 0.5, width * 0.04, width * 0.26)
    placeGroup("next", height * 0.5, width * 0.74, width * 0.96)
    placeGroup("friend", height * 0.76, width * 0.16, width * 0.84)
    placeGroup("sibling", height * 0.32, width * 0.16, width * 0.84)

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
      if (edge.type === "sibling") continue
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

    const showFriends = storedToggle(friendsStorageKey)
    const showInferred = storedToggle(inferredStorageKey)
    const width = Math.max(container.clientWidth || 320, 320)
    const height = Math.max(Number(config.height || 300), 260)
    const { visible, levels, edges } = collectVisible(center, index, showFriends, showInferred)
    const positions = layoutNodes(center, index, visible, edges, levels, width, height)
    const geometries = new Map()
    for (const slug of visible) {
      const pos = positions.get(slug)
      if (!pos) continue
      const geometry = nodeGeometry(slug, center, index)
      const margin = 10
      const clamped = {
        ...pos,
        x: Math.max(geometry.width / 2 + margin, Math.min(width - geometry.width / 2 - margin, pos.x)),
        y: Math.max(geometry.height / 2 + margin, Math.min(height - geometry.height / 2 - margin, pos.y)),
      }
      positions.set(slug, clamped)
      geometries.set(slug, { ...clamped, ...geometry })
    }
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
      const from = geometries.get(best.from)
      const to = geometries.get(best.to)
      const fromPort = portFor(from, best.type, to)
      const toPort = portFor(to, best.type, from, true)
      const line = svgEl("line", {
        x1: fromPort.x,
        y1: fromPort.y,
        x2: toPort.x,
        y2: toPort.y,
        class: "structured-brain-edge " + best.type + (best.explicit ? " explicit" : " inferred"),
        "data-from": best.from,
        "data-to": best.to,
        "data-direction": best.direction || "from",
        "data-relation": best.type,
      })
      if (["parent", "child", "prev", "next"].includes(best.type)) {
        if (best.direction === "to" || best.direction === "both") {
          line.setAttribute("marker-start", "url(#brain-arrow)")
        }
        if (!best.direction || best.direction === "from" || best.direction === "both") {
          line.setAttribute("marker-end", "url(#brain-arrow)")
        }
      }
      viewport.appendChild(line)
    }

    for (const slug of visible) {
      const pos = positions.get(slug)
      const geometry = geometries.get(slug)
      if (!pos || !geometry) continue
      const { title, lines, width: textWidth, height: textHeight, lineHeight } = geometry
      const group = svgEl("g", {
        class: "structured-brain-node " + (pos.role || "outer") + (slug === center ? " active" : ""),
        tabindex: "0",
        role: "link",
        "aria-label": title,
      })
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
        y: pos.y - ((lines.length - 1) * lineHeight) / 2 + (slug === center ? 5 : 4),
        "text-anchor": "middle",
      })
      for (const [index, line] of lines.entries()) {
        const tspan = svgEl("tspan", {
          x: pos.x,
          dy: index === 0 ? 0 : lineHeight,
        })
        tspan.textContent = line
        text.appendChild(tspan)
      }
      group.appendChild(text)
      for (const side of ["top", "right", "bottom", "left"]) {
        const port = portPosition(geometry, side)
        group.appendChild(
          svgEl("circle", {
            cx: port.x,
            cy: port.y,
            r: slug === center ? 4 : 3.5,
            class: "structured-brain-port " + side + " " + portRelationClass(side, pos.role),
            "aria-hidden": "true",
          }),
        )
      }
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

  function updateButtons(root) {
    for (const button of root.querySelectorAll(".structured-brain-filter")) {
      const active = storedToggle(button.dataset.storageKey)
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
      updateButtons(panel)
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
      for (const button of panel.querySelectorAll(".structured-brain-filter")) {
        button.onclick = () => {
          const key = button.dataset.storageKey
          localStorage.setItem(key, String(!storedToggle(key)))
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
          "button",
          {
            class: "structured-brain-filter",
            type: "button",
            "data-storage-key": "structured-brain-show-friends-v1",
            "aria-pressed": "false",
          },
          "Friends",
        ),
        h(
          "button",
          {
            class: "structured-brain-filter",
            type: "button",
            "data-storage-key": "structured-brain-show-inferred-v1",
            "aria-pressed": "false",
          },
          "Inferred",
        ),
      ),
      h("div", {
        class: "structured-brain-canvas",
        "data-cfg": JSON.stringify(options),
        style: `height: ${Number(options.height || 620)}px`,
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
.structured-brain-filter {
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--darkgray);
  cursor: pointer;
  font: inherit;
}

.structured-brain-fullscreen:hover,
.structured-brain-close:hover,
.structured-brain-filter:hover {
  background: var(--lightgray);
}

.structured-brain-controls {
  align-items: center;
  display: flex;
  gap: 0.4rem;
  padding: 0 0.75rem 0.45rem;
}

.structured-brain-filter {
  font-size: 0.75rem;
  padding: 0.18rem 0.5rem;
}

.structured-brain-filter.active {
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
  opacity: 0.7;
  stroke: color-mix(in srgb, var(--gray) 42%, transparent);
  stroke-linecap: round;
  stroke-width: 0.8;
}

.structured-brain-edge.parent,
.structured-brain-edge.child {
  stroke: color-mix(in srgb, var(--secondary) 72%, transparent);
}

.structured-brain-edge.prev,
.structured-brain-edge.next {
  stroke: color-mix(in srgb, var(--tertiary) 72%, transparent);
}

.structured-brain-edge.friend {
  stroke: color-mix(in srgb, var(--secondary) 55%, var(--tertiary));
}

.structured-brain-edge.sibling {
  stroke-dasharray: 5 5;
}

.structured-brain-edge.inferred {
  opacity: 0.3;
}

.structured-brain-arrow {
  fill: color-mix(in srgb, var(--gray) 62%, transparent);
}

.structured-brain-node {
  cursor: pointer;
  outline: none;
}

.structured-brain-node rect {
  fill: color-mix(in srgb, var(--light) 88%, white);
  stroke: var(--lightgray);
  stroke-width: 1.25;
}

.structured-brain-node text {
  fill: var(--dark);
  font-family: var(--bodyFont);
  font-size: 11.5px;
  font-weight: 700;
  pointer-events: none;
}

.structured-brain-node.active rect {
  fill: color-mix(in srgb, var(--secondary) 16%, var(--light));
  stroke: var(--secondary);
  stroke-width: 2.2;
}

.structured-brain-node.active text {
  font-size: 14px;
}

.structured-brain-node.outer rect {
  fill: color-mix(in srgb, var(--light) 94%, white);
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

.structured-brain-port {
  fill: color-mix(in srgb, var(--light) 84%, white);
  pointer-events: none;
  stroke: color-mix(in srgb, var(--gray) 68%, transparent);
  stroke-width: 1.1;
}

.structured-brain-port.parent,
.structured-brain-port.child {
  stroke: color-mix(in srgb, var(--secondary) 78%, transparent);
}

.structured-brain-port.prev,
.structured-brain-port.next {
  stroke: color-mix(in srgb, var(--tertiary) 78%, transparent);
}

.structured-brain-port.friend,
.structured-brain-port.sibling {
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
