// @ts-nocheck
const MIN_ZOOM = 0.1
const MAX_ZOOM = 5
const ZOOM_STEP = 0.15

function initExcalidraw() {
  const framePage = document.querySelector(".page[data-frame='excalidraw']")
  if (framePage) {
    initPanZoom(framePage)
    return
  }

  const embeddedPages = document.querySelectorAll(".excalidraw-page")
  for (const page of embeddedPages) {
    initPanZoom(page)
  }
}

function initPanZoom(page) {
  const container = page.querySelector(".excalidraw-container")
  if (!container) return

  const canvas = container.querySelector(".excalidraw-canvas")
  const svg = container.querySelector("svg")
  const exportImage = container.querySelector(".excalidraw-export-image")
  if (!canvas || (!svg && !exportImage)) return
  const transformTarget = exportImage ? canvas : svg

  function updateExportTheme() {
    if (!exportImage) return
    var dark = document.documentElement.getAttribute("saved-theme") === "dark"
    var preferredSource = exportImage.getAttribute(dark ? "data-dark-src" : "data-light-src")
    var fallbackSource = exportImage.getAttribute(dark ? "data-light-src" : "data-dark-src")
    var nextSource = preferredSource || fallbackSource
    if (nextSource && exportImage.getAttribute("src") !== nextSource) {
      exportImage.setAttribute("src", nextSource)
    }
  }

  updateExportTheme()

  function closeNoteMenu() {
    page.querySelector(".excalidraw-note-context-menu")?.remove()
  }

  function handleNoteContextMenu(e) {
    var link = e.target?.closest?.("[data-note-href]")
    if (!link || !container.contains(link)) return
    e.preventDefault()
    closeNoteMenu()

    var menu = document.createElement("div")
    menu.className = "excalidraw-note-context-menu"
    menu.style.left = e.clientX + "px"
    menu.style.top = e.clientY + "px"
    var menuLink = document.createElement("a")
    menuLink.href = link.getAttribute("data-note-href")
    menuLink.textContent = "Zum Zettel springen"
    menu.appendChild(menuLink)
    document.body.appendChild(menu)
  }

  function handleDismissNoteMenu(e) {
    if (!e.target?.closest?.(".excalidraw-note-context-menu")) closeNoteMenu()
  }

  function handleNoteMenuKeydown(e) {
    if (e.key === "Escape") closeNoteMenu()
  }

  container.addEventListener("contextmenu", handleNoteContextMenu)
  document.addEventListener("pointerdown", handleDismissNoteMenu)
  document.addEventListener("keydown", handleNoteMenuKeydown)

  container.style.backgroundColor = "var(--excalidraw-bg, var(--light))"

  var overlaysContainer = page.querySelector(".excalidraw-overlays")

  let zoom = 1
  let panX = 0
  let panY = 0
  let isDragging = false
  let didDrag = false
  let startX = 0
  let startY = 0

  function positionOverlays() {
    if (!overlaysContainer) return
    var overlays = overlaysContainer.querySelectorAll(
      ".excalidraw-overlay, .excalidraw-note-hotspot",
    )
    if (overlays.length === 0) return

    if (overlaysContainer.getAttribute("data-export") === "true") {
      var viewBoxWidth = parseFloat(overlaysContainer.getAttribute("data-viewbox-w")) || 1
      var viewBoxHeight = parseFloat(overlaysContainer.getAttribute("data-viewbox-h")) || 1
      var renderedScale = Math.min(
        canvas.clientWidth / viewBoxWidth,
        canvas.clientHeight / viewBoxHeight,
      )
      var renderedWidth = viewBoxWidth * renderedScale
      var renderedHeight = viewBoxHeight * renderedScale
      var renderedLeft = (canvas.clientWidth - renderedWidth) / 2
      var renderedTop = (canvas.clientHeight - renderedHeight) / 2

      for (var exportIndex = 0; exportIndex < overlays.length; exportIndex++) {
        var hotspot = overlays[exportIndex]
        var hotspotX = parseFloat(hotspot.getAttribute("data-x")) || 0
        var hotspotY = parseFloat(hotspot.getAttribute("data-y")) || 0
        var hotspotWidth = parseFloat(hotspot.getAttribute("data-w")) || 0
        var hotspotHeight = parseFloat(hotspot.getAttribute("data-h")) || 0
        var hotspotAngle = parseFloat(hotspot.getAttribute("data-angle")) || 0

        hotspot.style.left = renderedLeft + hotspotX * renderedScale + "px"
        hotspot.style.top = renderedTop + hotspotY * renderedScale + "px"
        hotspot.style.width = hotspotWidth * renderedScale + "px"
        hotspot.style.height = hotspotHeight * renderedScale + "px"
        hotspot.style.transform = "rotate(" + hotspotAngle + "rad)"
        hotspot.style.display = "block"
      }
      return
    }

    var offX = parseFloat(overlaysContainer.getAttribute("data-offset-x")) || 0
    var offY = parseFloat(overlaysContainer.getAttribute("data-offset-y")) || 0

    var ctm = svg?.getScreenCTM()
    var containerRect = container.getBoundingClientRect()
    if (!ctm) return

    for (var i = 0; i < overlays.length; i++) {
      var el = overlays[i]
      var ex = parseFloat(el.getAttribute("data-x")) || 0
      var ey = parseFloat(el.getAttribute("data-y")) || 0
      var ew = parseFloat(el.getAttribute("data-w")) || 0
      var eh = parseFloat(el.getAttribute("data-h")) || 0

      var svgX = ex + offX
      var svgY = ey + offY

      var screenLeft = svgX * ctm.a + ctm.e - containerRect.left
      var screenTop = svgY * ctm.d + ctm.f - containerRect.top
      var screenWidth = ew * ctm.a
      var screenHeight = eh * ctm.d

      el.style.left = screenLeft + "px"
      el.style.top = screenTop + "px"
      el.style.width = screenWidth + "px"
      el.style.height = screenHeight + "px"
      el.style.display = "flex"
    }
  }

  positionOverlays()

  function applyTransform() {
    transformTarget.style.transform =
      "translate(" + panX + "px, " + panY + "px) scale(" + zoom + ")"
    positionOverlays()
  }

  function handleWheel(e) {
    e.preventDefault()
    var delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta))
    applyTransform()
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return
    isDragging = true
    didDrag = false
    startX = e.clientX - panX
    startY = e.clientY - panY
    container.style.cursor = "grabbing"
  }

  function handleMouseMove(e) {
    if (!isDragging) return
    if (Math.abs(e.clientX - panX - startX) > 4 || Math.abs(e.clientY - panY - startY) > 4) {
      didDrag = true
    }
    panX = e.clientX - startX
    panY = e.clientY - startY
    applyTransform()
  }

  function handleMouseUp() {
    isDragging = false
    container.style.cursor = "grab"
  }

  function handleNoteClick(e) {
    var link = e.target?.closest?.("[data-note-href]")
    if (!link || !container.contains(link) || didDrag) return
    var href = link.getAttribute("data-note-href")
    if (!href) return
    e.preventDefault()
    window.location.assign(href)
  }

  var zoomInBtn = page.querySelector(".excalidraw-zoom-in")
  var zoomOutBtn = page.querySelector(".excalidraw-zoom-out")
  var resetBtn = page.querySelector(".excalidraw-reset")

  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", function () {
      zoom = Math.min(MAX_ZOOM, zoom + ZOOM_STEP)
      applyTransform()
    })
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", function () {
      zoom = Math.max(MIN_ZOOM, zoom - ZOOM_STEP)
      applyTransform()
    })
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      zoom = 1
      panX = 0
      panY = 0
      applyTransform()
    })
  }

  var lastTouchDist = 0

  function handleTouchStart(e) {
    if (e.touches.length === 1) {
      isDragging = true
      startX = e.touches[0].clientX - panX
      startY = e.touches[0].clientY - panY
    } else if (e.touches.length === 2) {
      isDragging = false
      var dx = e.touches[0].clientX - e.touches[1].clientX
      var dy = e.touches[0].clientY - e.touches[1].clientY
      lastTouchDist = Math.sqrt(dx * dx + dy * dy)
    }
  }

  function handleTouchMove(e) {
    e.preventDefault()
    if (e.touches.length === 1 && isDragging) {
      panX = e.touches[0].clientX - startX
      panY = e.touches[0].clientY - startY
      applyTransform()
    } else if (e.touches.length === 2 && lastTouchDist > 0) {
      var dx = e.touches[0].clientX - e.touches[1].clientX
      var dy = e.touches[0].clientY - e.touches[1].clientY
      var dist = Math.sqrt(dx * dx + dy * dy)
      var scale = dist / lastTouchDist
      zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * scale))
      lastTouchDist = dist
      applyTransform()
    }
  }

  function handleTouchEnd() {
    isDragging = false
    lastTouchDist = 0
  }

  container.addEventListener("wheel", handleWheel, { passive: false })
  container.addEventListener("mousedown", handleMouseDown)
  container.addEventListener("click", handleNoteClick)
  document.addEventListener("mousemove", handleMouseMove)
  document.addEventListener("mouseup", handleMouseUp)
  container.addEventListener("touchstart", handleTouchStart, { passive: true })
  container.addEventListener("touchmove", handleTouchMove, { passive: false })
  container.addEventListener("touchend", handleTouchEnd)
  var resizeObserver = new ResizeObserver(positionOverlays)
  resizeObserver.observe(container)
  var themeObserver = new MutationObserver(function () {
    updateExportTheme()
    positionOverlays()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["saved-theme"],
  })
  exportImage?.addEventListener("load", positionOverlays)

  window.addCleanup(function () {
    closeNoteMenu()
    container.removeEventListener("contextmenu", handleNoteContextMenu)
    document.removeEventListener("pointerdown", handleDismissNoteMenu)
    document.removeEventListener("keydown", handleNoteMenuKeydown)
    container.removeEventListener("wheel", handleWheel)
    container.removeEventListener("mousedown", handleMouseDown)
    container.removeEventListener("click", handleNoteClick)
    document.removeEventListener("mousemove", handleMouseMove)
    document.removeEventListener("mouseup", handleMouseUp)
    container.removeEventListener("touchstart", handleTouchStart)
    container.removeEventListener("touchmove", handleTouchMove)
    container.removeEventListener("touchend", handleTouchEnd)
    resizeObserver.disconnect()
    themeObserver.disconnect()
    exportImage?.removeEventListener("load", positionOverlays)
  })
}

document.addEventListener("nav", initExcalidraw)
