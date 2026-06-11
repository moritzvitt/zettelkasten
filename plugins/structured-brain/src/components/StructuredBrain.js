import { h } from "preact"

const defaultOptions = {
  height: 620,
  minHeight: 260,
  compactThreshold: 5,
}

function classNames(...classes) {
  return classes.filter(Boolean).join(" ")
}

const script = `
(() => {
  const friendsStorageKey = "structured-brain-show-friends-v1"
  const relationLabels = {
    parent: "Parent",
    child: "Child",
    prev: "Prev",
    next: "Next",
    friend: "Friend",
  }
  const relationTypes = ["parent", "child", "prev", "next", "friend"]
  const relationClasses = new Set(relationTypes)
  const inverseTypes = {
    parent: "child",
    child: "parent",
    prev: "next",
    next: "prev",
    friend: "friend",
  }

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

  function isModalCanvas(container) {
    return Boolean(container.closest(".structured-brain-modal"))
  }

  function wrapLabel(text, maxLine = 30, maxLines = 2) {
    const original = String(text || "").replace(/\\s+/g, " ").trim()
    const words = original
      .split(" ")
      .flatMap((word) => {
        if (word.length <= maxLine) return [word]
        const chunks = []
        for (let index = 0; index < word.length; index += maxLine) {
          chunks.push(word.slice(index, index + maxLine))
        }
        return chunks
      })
    const lines = []
    let current = ""
    let consumed = 0
    for (const word of words) {
      const next = current ? current + " " + word : word
      if (next.length <= maxLine) {
        current = next
      } else {
        if (current) lines.push(current)
        current = word
      }
      consumed += word.length
      if (lines.length === maxLines) break
    }
    if (lines.length < maxLines && current) lines.push(current)
    const visibleLength = lines.join("").replace(/\\.{3}$/, "").length
    const originalLength = original.replace(/\\s/g, "").length
    if ((visibleLength < originalLength || consumed < originalLength) && lines.length) {
      lines[lines.length - 1] = lines[lines.length - 1].replace(/\\.{3}$/, "")
      if (lines[lines.length - 1].length > maxLine - 3) {
        lines[lines.length - 1] = lines[lines.length - 1].slice(0, maxLine - 3)
      }
      lines[lines.length - 1] += "..."
    }
    return lines.length ? lines : [original]
  }

  function storedToggle(key, defaultValue = false) {
    const stored = localStorage.getItem(key)
    return stored === null ? defaultValue : stored === "true"
  }

  function compactLabel(text, wordLimit = 4, characterLimit = 20) {
    const words = String(text || "").replace(/\\s+/g, " ").trim().split(" ")
    const candidate = words.slice(0, wordLimit).join(" ")
    const truncated = words.length > wordLimit || candidate.length > characterLimit
    if (!truncated) return candidate
    return candidate.slice(0, characterLimit).trimEnd().replace(/[.,;:!?-]+$/, "") + "..."
  }

  function relationVisible(edge, showFriends, showInferred) {
    if (edge.type === "friend" && !showFriends) return false
    if (!edge.explicit && !showInferred) return false
    return relationClasses.has(edge.type)
  }

  function hasRelationships(index, center) {
    const valid = new Set(Object.keys(index.nodes || {}))
    if (!valid.has(center)) return false
    return (index.relationships || []).some(
      (edge) =>
        edge.from === center &&
        valid.has(edge.to) &&
        relationClasses.has(edge.type),
    )
  }

  function collectSequenceSide(center, type, relationships, valid, blocked) {
    const seen = new Set()
    const depths = new Map()
    const queue = [{ slug: center, depth: 0 }]

    while (queue.length) {
      const current = queue.shift()
      const targets = [
        ...new Set(
          relationships
            .filter((edge) => edge.from === current.slug && edge.type === type && valid.has(edge.to))
            .map((edge) => edge.to),
        ),
      ].sort()

      for (const target of targets) {
        if (target === center || blocked.has(target) || seen.has(target)) continue
        seen.add(target)
        depths.set(target, current.depth + 1)
        queue.push({ slug: target, depth: current.depth + 1 })
      }
    }

    return {
      slugs: [...seen].sort((a, b) => depths.get(a) - depths.get(b) || a.localeCompare(b)),
      depths,
    }
  }

  function collectSequence(center, relationships, valid) {
    const prev = collectSequenceSide(center, "prev", relationships, valid, new Set())
    const next = collectSequenceSide(center, "next", relationships, valid, new Set(prev.slugs))

    return {
      prev: prev.slugs,
      next: next.slugs,
      prevDepths: prev.depths,
      nextDepths: next.depths,
    }
  }

  function collectVisible(center, index, showFriends, showInferred, expandSequence = false) {
    const valid = new Set(Object.keys(index.nodes || {}))
    const relationships = (index.relationships || []).filter((edge) =>
      relationVisible(edge, showFriends, showInferred),
    )
    const visible = new Set([center])
    const centerRelationships = relationships.filter((edge) => edge.from === center)
    const sequence = expandSequence
      ? collectSequence(center, relationships, valid)
      : { prev: [], next: [] }

    for (const edge of centerRelationships) {
      if (!valid.has(edge.to)) continue
      visible.add(edge.to)
    }
    for (const slug of sequence.prev) visible.add(slug)
    for (const slug of sequence.next) visible.add(slug)

    const sequenceSide = (slug) => {
      if (sequence.prev.includes(slug)) return "prev"
      if (sequence.next.includes(slug)) return "next"
      return null
    }
    const visibleRelationships = relationships.filter((edge) => {
      if (!visible.has(edge.from) || !visible.has(edge.to)) return false
      if (expandSequence && (edge.type === "prev" || edge.type === "next")) {
        const fromSide = sequenceSide(edge.from)
        const toSide = sequenceSide(edge.to)
        if (fromSide && toSide && fromSide !== toSide) return false
      }
      return true
    })
    return { visible, centerRelationships, relationships: visibleRelationships, sequence }
  }

  function nodeGeometry(slug, center, index, compact) {
    const data = index.nodes[slug]
    const title = data?.title || slug
    const isCenter = slug === center
    const lines = compact && !isCenter
      ? [compactLabel(title)]
      : wrapLabel(title, isCenter ? 38 : 30, 2)
    const longest = lines.reduce((max, line) => Math.max(max, line.length), 0)
    const width = Math.max(
      compact && !isCenter ? 82 : 104,
      Math.min(isCenter ? 360 : compact ? 176 : 300, longest * (isCenter ? 8.8 : 7.2) + 28),
    )
    const lineHeight = isCenter ? 16 : 14
    const height = Math.max(isCenter ? 38 : compact ? 28 : 30, lines.length * lineHeight + 14)
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
    if (relationClasses.has(role)) {
      return role
    }
    return ""
  }

  function centeredRelationships(center, relationships) {
    const result = {}
    for (const type of relationClasses) result[type] = []
    for (const edge of relationships) {
      if (edge.from !== center || !relationClasses.has(edge.type)) continue
      result[edge.type].push(edge.to)
    }
    for (const type of relationClasses) result[type] = [...new Set(result[type])]
    return result
  }

  function groupSize(slugs, geometries, direction, gap = 34) {
    if (!slugs.length) return { width: 0, height: 0 }
    if (direction === "horizontal") {
      return {
        width: slugs.reduce((sum, slug) => sum + geometries.get(slug).width, 0) +
          gap * (slugs.length - 1),
        height: Math.max(...slugs.map((slug) => geometries.get(slug).height)),
      }
    }
    return {
      width: Math.max(...slugs.map((slug) => geometries.get(slug).width)),
      height: slugs.reduce((sum, slug) => sum + geometries.get(slug).height, 0) +
        gap * (slugs.length - 1),
    }
  }

  function placeHorizontal(positions, slugs, geometries, y, role, gap = 34) {
    const size = groupSize(slugs, geometries, "horizontal", gap)
    let x = -size.width / 2
    for (const slug of slugs) {
      const geometry = geometries.get(slug)
      positions.set(slug, { x: x + geometry.width / 2, y, role })
      x += geometry.width + gap
    }
  }

  function placeVertical(positions, slugs, geometries, x, role, gap = 34) {
    const size = groupSize(slugs, geometries, "vertical", gap)
    let y = -size.height / 2
    for (const slug of slugs) {
      const geometry = geometries.get(slug)
      positions.set(slug, { x, y: y + geometry.height / 2, role })
      y += geometry.height + gap
    }
  }

  function sequenceColumns(slugs, depths) {
    const columns = new Map()
    for (const slug of slugs) {
      const depth = depths.get(slug) || 1
      if (!columns.has(depth)) columns.set(depth, [])
      columns.get(depth).push(slug)
    }
    return [...columns.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, values]) => values.sort())
  }

  function placeSequenceSide(positions, slugs, depths, geometries, centerGeometry, side, gap) {
    let edge = side === "left" ? -centerGeometry.width / 2 : centerGeometry.width / 2
    const role = side === "left" ? "prev" : "next"

    for (const column of sequenceColumns(slugs, depths)) {
      const size = groupSize(column, geometries, "vertical", gap)
      const x = side === "left"
        ? edge - gap - size.width / 2
        : edge + gap + size.width / 2
      placeVertical(positions, column, geometries, x, role, gap)
      edge = side === "left" ? x - size.width / 2 : x + size.width / 2
    }
  }

  function sideBoundary(positions, geometries, groupHeight, side) {
    const groupTop = -groupHeight / 2
    const groupBottom = groupHeight / 2
    let boundary = 0

    for (const [slug, pos] of positions) {
      const geometry = geometries.get(slug)
      const top = pos.y - geometry.height / 2
      const bottom = pos.y + geometry.height / 2
      if (bottom <= groupTop || top >= groupBottom) continue

      const edge = pos.x + (side === "right" ? geometry.width / 2 : -geometry.width / 2)
      boundary = side === "right" ? Math.max(boundary, edge) : Math.min(boundary, edge)
    }

    return boundary
  }

  function layoutNodes(
    center,
    visible,
    centerRelationships,
    geometries,
    minimumWidth,
    minimumHeight,
    compact,
    sequence,
  ) {
    const positions = new Map([[center, { x: 0, y: 0, role: "center" }]])
    const grouped = centeredRelationships(center, centerRelationships)
    const claimed = new Set([center])
    const groups = {}

    for (const type of relationTypes) {
      const sequenceSlugs = new Set([...(sequence?.prev || []), ...(sequence?.next || [])])
      groups[type] = (grouped[type] || []).filter((slug) => {
        if (!visible.has(slug) || claimed.has(slug)) return false
        if (sequenceSlugs.has(slug)) return false
        claimed.add(slug)
        return true
      })
    }

    const centerGeometry = geometries.get(center)
    const nodeGap = compact ? 22 : 34
    const sequenceGap = compact ? 28 : 42
    const parentSize = groupSize(groups.parent, geometries, "horizontal", nodeGap)
    const childSize = groupSize(groups.child, geometries, "horizontal", nodeGap)
    const friendSize = groupSize(groups.friend, geometries, "horizontal", nodeGap)
    const prevSize = groupSize(groups.prev, geometries, "vertical", nodeGap)
    const nextSize = groupSize(groups.next, geometries, "vertical", nodeGap)
    const verticalGap = compact ? 56 : 100

    placeSequenceSide(
      positions,
      sequence?.prev || [],
      sequence?.prevDepths || new Map(),
      geometries,
      centerGeometry,
      "left",
      sequenceGap,
    )
    placeSequenceSide(
      positions,
      sequence?.next || [],
      sequence?.nextDepths || new Map(),
      geometries,
      centerGeometry,
      "right",
      sequenceGap,
    )

    if (groups.parent.length) {
      placeHorizontal(
        positions,
        groups.parent,
        geometries,
        -(centerGeometry.height / 2 + verticalGap + parentSize.height / 2),
        "parent",
        nodeGap,
      )
    }
    if (groups.child.length) {
      placeHorizontal(
        positions,
        groups.child,
        geometries,
        centerGeometry.height / 2 + verticalGap + childSize.height / 2,
        "child",
        nodeGap,
      )
    }
    if (groups.friend.length) {
      const childBottom = groups.child.length
        ? centerGeometry.height / 2 + verticalGap + childSize.height
        : centerGeometry.height / 2
      placeHorizontal(
        positions,
        groups.friend,
        geometries,
        childBottom + verticalGap + friendSize.height / 2,
        "friend",
        nodeGap,
      )
    }

    const sideGap = compact ? 44 : 64
    if (groups.prev.length) {
      const leftBoundary = sideBoundary(positions, geometries, prevSize.height, "left")
      placeVertical(
        positions,
        groups.prev,
        geometries,
        leftBoundary - sideGap - prevSize.width / 2,
        "prev",
        nodeGap,
      )
    }
    if (groups.next.length) {
      const rightBoundary = sideBoundary(positions, geometries, nextSize.height, "right")
      placeVertical(
        positions,
        groups.next,
        geometries,
        rightBoundary + sideGap + nextSize.width / 2,
        "next",
        nodeGap,
      )
    }

    const margin = compact ? 28 : 44
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [slug, pos] of positions) {
      const geometry = geometries.get(slug)
      minX = Math.min(minX, pos.x - geometry.width / 2)
      maxX = Math.max(maxX, pos.x + geometry.width / 2)
      minY = Math.min(minY, pos.y - geometry.height / 2)
      maxY = Math.max(maxY, pos.y + geometry.height / 2)
    }

    const contentWidth = maxX - minX + margin * 2
    const contentHeight = maxY - minY + margin * 2
    const width = Math.max(minimumWidth, contentWidth)
    const height = Math.max(minimumHeight, contentHeight)
    const offsetX = (width - (maxX - minX)) / 2 - minX
    const offsetY = (height - (maxY - minY)) / 2 - minY
    for (const [slug, pos] of positions) {
      positions.set(slug, { ...pos, x: pos.x + offsetX, y: pos.y + offsetY })
    }

    return { positions, width, height }
  }

  function relationFamily(type) {
    if (type === "parent" || type === "child") return "hierarchy"
    if (type === "prev" || type === "next") return "sequence"
    return type
  }

  function relationPriority(edge) {
    return relationTypes.indexOf(edge.type)
  }

  function displayRelationships(relationships, center) {
    const byPairAndFamily = new Map()
    for (const relationship of relationships) {
      const pair = [relationship.from, relationship.to].sort().join("\\u0000")
      const key = pair + "\\u0000" + relationFamily(relationship.type)
      if (!byPairAndFamily.has(key)) byPairAndFamily.set(key, [])
      byPairAndFamily.get(key).push(relationship)
    }

    return [...byPairAndFamily.values()].map((candidates) => {
      const sorted = [...candidates].sort((a, b) => {
        const aFromCenter = a.from === center ? 0 : 1
        const bFromCenter = b.from === center ? 0 : 1
        if (aFromCenter !== bFromCenter) return aFromCenter - bFromCenter
        if (a.explicit !== b.explicit) return a.explicit ? -1 : 1
        return relationPriority(a) - relationPriority(b)
      })
      const relationship = sorted[0]
      const reverse = candidates.find(
        (candidate) =>
          candidate.from === relationship.to &&
          candidate.to === relationship.from &&
          candidate.type === inverseTypes[relationship.type],
      )
      return {
        ...relationship,
        direction:
          relationship.explicit && reverse?.explicit
            ? "both"
            : relationship.explicit
              ? "from"
              : reverse?.explicit
                ? "to"
                : "none",
      }
    })
  }

  function installPanZoom(svg, viewport, width, height) {
    const state = { x: 0, y: 0, k: 1 }
    let drag = null
    svg.classList.add("is-pan-enabled")

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
    const showInferred = true
    const compactEnabled = true
    const minimumWidth = Math.max(container.clientWidth || 320, 320)
    const requestedHeight = Number(config.height || 0)
    const minimumHeight = isModalCanvas(container)
      ? Math.max(requestedHeight || 760, 420)
      : Math.max(Number(config.minHeight || 260), 180)
    const expandSequence = config.expandSequence === true
    const { visible, centerRelationships, relationships, sequence } = collectVisible(
      center,
      index,
      showFriends,
      showInferred,
      expandSequence,
    )
    const compact = compactEnabled && visible.size - 1 >= Number(config.compactThreshold || 5)
    const geometries = new Map()
    for (const slug of visible) {
      geometries.set(slug, nodeGeometry(slug, center, index, compact))
    }
    const layout = layoutNodes(
      center,
      visible,
      centerRelationships,
      geometries,
      minimumWidth,
      minimumHeight,
      compact,
      sequence,
    )
    const { positions, width, height } = layout
    if (!isModalCanvas(container)) {
      container.style.height = Math.ceil(height) + "px"
    }
    for (const [slug, pos] of positions) {
      geometries.set(slug, { ...geometries.get(slug), ...pos })
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

    const tooltip = svgEl("g", {
      class: "structured-brain-tooltip",
      visibility: "hidden",
      "aria-hidden": "true",
    })
    const tooltipRect = svgEl("rect", { rx: 5, ry: 5 })
    const tooltipText = svgEl("text", { "text-anchor": "middle" })
    tooltip.appendChild(tooltipRect)
    tooltip.appendChild(tooltipText)

    function showTooltip(geometry) {
      if (!compact) return
      const lines = wrapLabel(geometry.title, 42, 4)
      const lineHeight = 15
      const tooltipWidth = Math.min(
        330,
        Math.max(150, Math.max(...lines.map((line) => line.length)) * 7.1 + 24),
      )
      const tooltipHeight = lines.length * lineHeight + 18
      const x = Math.max(
        tooltipWidth / 2 + 8,
        Math.min(width - tooltipWidth / 2 - 8, geometry.x),
      )
      const above = geometry.y - geometry.height / 2 - tooltipHeight - 12
      const y = above >= 8 ? above : geometry.y + geometry.height / 2 + 12

      clear(tooltipText)
      tooltipRect.setAttribute("x", String(x - tooltipWidth / 2))
      tooltipRect.setAttribute("y", String(y))
      tooltipRect.setAttribute("width", String(tooltipWidth))
      tooltipRect.setAttribute("height", String(tooltipHeight))
      tooltipText.setAttribute("x", String(x))
      tooltipText.setAttribute("y", String(y + 15))
      for (const [index, line] of lines.entries()) {
        const tspan = svgEl("tspan", { x, dy: index === 0 ? 0 : lineHeight })
        tspan.textContent = line
        tooltipText.appendChild(tspan)
      }
      tooltip.setAttribute("visibility", "visible")
    }

    function hideTooltip() {
      tooltip.setAttribute("visibility", "hidden")
    }

    function showNodeTooltip(event) {
      const target = event.target
      const group =
        target && typeof target.closest === "function"
          ? target.closest(".structured-brain-node")
          : null
      if (!group) return
      const geometry = geometries.get(group.dataset.slug)
      if (geometry) showTooltip(geometry)
    }

    function hideNodeTooltip(event) {
      const target = event.target
      const group =
        target && typeof target.closest === "function"
          ? target.closest(".structured-brain-node")
          : null
      if (!group) return
      const relatedTarget = event.relatedTarget
      const nextGroup =
        relatedTarget && typeof relatedTarget.closest === "function"
          ? relatedTarget.closest(".structured-brain-node")
          : null
      if (nextGroup === group) return
      hideTooltip()
    }

    viewport.addEventListener("pointerover", showNodeTooltip)
    viewport.addEventListener("mousemove", showNodeTooltip)
    viewport.addEventListener("pointerout", hideNodeTooltip)
    viewport.addEventListener("mouseleave", hideTooltip)

    for (const relationship of displayRelationships(relationships, center)) {
      if (!positions.has(relationship.from) || !positions.has(relationship.to)) continue
      const from = geometries.get(relationship.from)
      const to = geometries.get(relationship.to)
      const fromPort = portFor(from, relationship.type, to)
      const toPort = portFor(to, relationship.type, from, true)
      const line = svgEl("line", {
        x1: fromPort.x,
        y1: fromPort.y,
        x2: toPort.x,
        y2: toPort.y,
        class:
          "structured-brain-edge " +
          relationship.type +
          (relationship.explicit ? " explicit" : " inferred"),
        "data-from": relationship.from,
        "data-to": relationship.to,
        "data-direction": relationship.direction,
        "data-relation": relationship.type,
      })
      if (["parent", "child", "prev", "next"].includes(relationship.type)) {
        if (relationship.direction === "to" || relationship.direction === "both") {
          line.setAttribute("marker-start", "url(#brain-arrow)")
        }
        if (relationship.direction === "from" || relationship.direction === "both") {
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
        "data-slug": slug,
      })
      const nativeTitle = svgEl("title")
      nativeTitle.textContent = title
      group.appendChild(nativeTitle)
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
      group.addEventListener("focus", () => showTooltip(geometry))
      group.addEventListener("blur", hideTooltip)
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          window.location.href = pageUrl(slug)
        }
      })
      viewport.appendChild(group)
    }
    viewport.appendChild(tooltip)

    if (isModalCanvas(container)) {
      installPanZoom(svg, viewport, width, height)
    }
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
      const active = storedToggle(
        button.dataset.storageKey,
        button.dataset.defaultActive === "true",
      )
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
      const validSlugs = new Set(Object.keys(index.nodes || {}))
      const center = resolveSlug(current, validSlugs)
      panel.hidden = !hasRelationships(index, center)
      if (panel.hidden) continue

      updateButtons(panel)
      for (const canvas of panel.querySelectorAll(".structured-brain-canvas")) {
        const config = JSON.parse(canvas.dataset.cfg || "{}")
        draw(canvas, index, current, config)
      }
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
          const defaultValue = button.dataset.defaultActive === "true"
          localStorage.setItem(key, String(!storedToggle(key, defaultValue)))
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
            class: "structured-brain-fullscreen",
            type: "button",
            title: "Sequenzansicht gross oeffnen",
            "aria-label": "Sequenzansicht gross oeffnen",
          },
          h(
            "svg",
            {
              "aria-hidden": "true",
              class: "structured-brain-fullscreen-icon",
              viewBox: "0 0 24 24",
            },
            h("path", {
              d: "M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4",
            }),
            h("path", {
              d: "M9 5 5 9M15 5l4 4M19 15l-4 4M5 15l4 4",
            }),
          ),
        ),
      ),
      h("div", {
        class: "structured-brain-canvas",
        "data-cfg": JSON.stringify(options),
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
            "data-cfg": JSON.stringify({ ...options, height: 760, expandSequence: true }),
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
  gap: 0.35rem;
  justify-content: flex-end;
  padding: 0.28rem 0.5rem 0.2rem;
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

.structured-brain-filter {
  font-size: 0.72rem;
  padding: 0.12rem 0.42rem;
}

.structured-brain-filter.active {
  background: var(--highlight);
  border-color: var(--secondary);
  color: var(--secondary);
  font-weight: 700;
}

.structured-brain-fullscreen {
  align-items: center;
  display: inline-flex;
  padding: 0.14rem;
}

.structured-brain-fullscreen-icon {
  fill: none;
  height: 1.05rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  width: 1.05rem;
}

.structured-brain-canvas {
  color: var(--gray);
  min-height: 180px;
  overflow: hidden;
}

.structured-brain-modal .structured-brain-canvas {
  min-height: 420px;
}

.structured-brain-svg {
  display: block;
  height: 100%;
  width: 100%;
}

.structured-brain-svg.is-pan-enabled {
  cursor: grab;
  touch-action: none;
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

.structured-brain-tooltip {
  pointer-events: none;
}

.structured-brain-tooltip rect {
  fill: color-mix(in srgb, var(--dark) 92%, transparent);
  stroke: color-mix(in srgb, var(--light) 28%, transparent);
  stroke-width: 0.8;
}

.structured-brain-tooltip text {
  fill: var(--light);
  font-family: var(--bodyFont);
  font-size: 11.5px;
  font-weight: 600;
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
