import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs"

const workerBlob = new Blob([__PDF_WORKER_SOURCE__], { type: "text/javascript" })
pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob)

const viewers = new Set()
const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25
const SPREAD_MIN_WIDTH = 620
const PAGE_GAP = 14

function staticAssetUrl(directory) {
  const basePath = String(document.body?.dataset?.basepath || "").replace(/^\/+|\/+$/g, "")
  const prefix = basePath ? `/${basePath}` : ""
  return new URL(`${prefix}/static/pdfjs/${directory}/`, window.location.origin).href
}

function isFocused(state) {
  return state.root.classList.contains("is-focused")
}

function visibleColumns(state) {
  return state.stage.clientWidth >= SPREAD_MIN_WIDTH ? 2 : 1
}

function displayedPageRange(state) {
  if (!state.document) return "– / –"
  const end = Math.min(state.document.numPages, state.pageNumber + state.columns - 1)
  const current = end > state.pageNumber ? `${state.pageNumber}–${end}` : `${state.pageNumber}`
  return `${current} / ${state.document.numPages}`
}

function updateControls(state) {
  state.previous.disabled = state.pageNumber <= 1
  state.next.disabled =
    !state.document || state.pageNumber + state.columns > state.document.numPages
  state.status.value = displayedPageRange(state)
  state.zoomStatus.value = `${Math.round(state.zoom * 100)}%`
  state.zoomOut.disabled = state.zoom <= MIN_ZOOM
  state.zoomIn.disabled = state.zoom >= MAX_ZOOM
  state.root.classList.toggle("is-zoomed", state.zoom !== 1)
}

function cancelRenderTasks(state) {
  for (const task of state.renderTasks.values()) task.cancel()
  state.renderTasks.clear()
}

function fitScale(state, viewport, columns = state.columns) {
  const availableWidth = Math.max(1, state.stage.clientWidth - 24 - PAGE_GAP * (columns - 1))
  const availableHeight = Math.max(1, state.stage.clientHeight - 24)
  const fitWidth = availableWidth / columns / viewport.width
  const fitHeight = availableHeight / viewport.height
  return Math.min(fitWidth, fitHeight) * state.zoom
}

async function renderCanvas(state, pageNumber, canvas, scale, key, generation) {
  const page = await state.document.getPage(pageNumber)
  if (generation !== state.renderGeneration || !canvas.isConnected) return

  const viewport = page.getViewport({ scale })
  const outputScale = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
  canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`

  const context = canvas.getContext("2d", { alpha: false })
  const task = page.render({
    canvasContext: context,
    viewport,
    transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
  })
  state.renderTasks.set(key, task)
  try {
    await task.promise
  } finally {
    if (state.renderTasks.get(key) === task) state.renderTasks.delete(key)
  }
}

async function renderPreview(state) {
  if (!state.document || !state.root.isConnected || isFocused(state)) return
  const generation = ++state.renderGeneration
  cancelRenderTasks(state)
  state.columns = visibleColumns(state)
  state.pages.className = "pdf-pages pdf-preview-pages"
  state.pages.replaceChildren()
  state.pages.style.gridTemplateColumns = `repeat(${state.columns}, max-content)`

  const pageNumbers = Array.from(
    { length: Math.min(state.columns, state.document.numPages - state.pageNumber + 1) },
    (_, index) => state.pageNumber + index,
  )
  const previews = pageNumbers.map((pageNumber) => {
    const frame = document.createElement("div")
    frame.className = "pdf-page-frame"
    frame.dataset.pageNumber = String(pageNumber)
    const canvas = document.createElement("canvas")
    canvas.className = "pdf-page"
    canvas.setAttribute("aria-label", `PDF-Seite ${pageNumber}`)
    frame.append(canvas)
    state.pages.append(frame)
    return { pageNumber, canvas }
  })

  try {
    await Promise.all(
      previews.map(async ({ pageNumber, canvas }) => {
        const page = await state.document.getPage(pageNumber)
        if (generation !== state.renderGeneration) return
        const viewport = page.getViewport({ scale: 1 })
        const scale = fitScale(state, viewport)
        await renderCanvas(state, pageNumber, canvas, scale, `preview-${pageNumber}`, generation)
      }),
    )
    if (generation !== state.renderGeneration) return
    state.root.classList.add("is-ready")
    updateControls(state)
  } catch (error) {
    if (error?.name === "RenderingCancelledException") return
    console.warn("[PdfViewer] Vorschau konnte nicht gerendert werden", error)
    state.loading.textContent = "PDF-Vorschau konnte nicht geladen werden."
  }
}

function schedulePreview(state) {
  cancelAnimationFrame(state.frame)
  state.frame = requestAnimationFrame(() => renderPreview(state))
}

function continuousScale(state) {
  return fitScale(state, state.firstViewport, state.columns)
}

function createContinuousPages(state) {
  const generation = ++state.renderGeneration
  cancelRenderTasks(state)
  state.columns = visibleColumns(state)
  const scale = continuousScale(state)
  const pageWidth = Math.floor(state.firstViewport.width * scale)
  const pageHeight = Math.floor(state.firstViewport.height * scale)

  state.pages.className = "pdf-pages pdf-continuous-pages"
  state.pages.replaceChildren()
  state.pages.style.gridTemplateColumns = `repeat(${state.columns}, ${pageWidth}px)`
  state.pageElements = []

  for (let pageNumber = 1; pageNumber <= state.document.numPages; pageNumber += 1) {
    const frame = document.createElement("div")
    frame.className = "pdf-page-frame pdf-page-placeholder"
    frame.dataset.pageNumber = String(pageNumber)
    frame.style.width = `${pageWidth}px`
    frame.style.height = `${pageHeight}px`
    state.pages.append(frame)
    state.pageElements.push(frame)
  }

  state.stage.scrollTop = Math.max(
    0,
    state.pageElements[state.pageNumber - 1]?.offsetTop - state.stage.clientHeight * 0.08,
  )
  state.stage.scrollLeft = 0
  state.continuousGeneration = generation
  updateControls(state)
  scheduleVisiblePages(state)
}

async function renderContinuousPage(state, frame, generation) {
  const pageNumber = Number(frame.dataset.pageNumber)
  if (!pageNumber || frame.querySelector("canvas")) return

  const canvas = document.createElement("canvas")
  canvas.className = "pdf-page"
  canvas.setAttribute("aria-label", `PDF-Seite ${pageNumber}`)
  frame.append(canvas)
  frame.classList.remove("pdf-page-placeholder")

  try {
    const page = await state.document.getPage(pageNumber)
    if (generation !== state.renderGeneration || !frame.isConnected) return
    const viewport = page.getViewport({ scale: 1 })
    const scale = fitScale(state, viewport, state.columns)
    const scaledViewport = page.getViewport({ scale })
    frame.style.width = `${Math.floor(scaledViewport.width)}px`
    frame.style.height = `${Math.floor(scaledViewport.height)}px`
    await renderCanvas(state, pageNumber, canvas, scale, `continuous-${pageNumber}`, generation)
  } catch (error) {
    if (error?.name === "RenderingCancelledException") return
    console.warn(`[PdfViewer] Seite ${pageNumber} konnte nicht gerendert werden`, error)
  }
}

function updateCurrentPageFromScroll(state, stageRect) {
  const marker = stageRect.top + Math.min(80, stageRect.height * 0.15)
  const firstVisible = state.pageElements.find(
    (frame) => frame.getBoundingClientRect().bottom > marker,
  )
  if (!firstVisible) return
  const pageNumber = Number(firstVisible.dataset.pageNumber)
  if (pageNumber && pageNumber !== state.pageNumber) {
    state.pageNumber = pageNumber
    updateControls(state)
  }
}

function renderVisiblePages(state) {
  if (!isFocused(state) || !state.document) return
  const generation = state.continuousGeneration
  const stageRect = state.stage.getBoundingClientRect()
  const renderTop = stageRect.top - stageRect.height * 1.5
  const renderBottom = stageRect.bottom + stageRect.height * 1.5
  const retainTop = stageRect.top - stageRect.height * 4
  const retainBottom = stageRect.bottom + stageRect.height * 4

  updateCurrentPageFromScroll(state, stageRect)
  for (const frame of state.pageElements) {
    const rect = frame.getBoundingClientRect()
    const canvas = frame.querySelector("canvas")
    if (rect.bottom >= renderTop && rect.top <= renderBottom) {
      if (!canvas) renderContinuousPage(state, frame, generation)
    } else if (canvas && (rect.bottom < retainTop || rect.top > retainBottom)) {
      const pageNumber = Number(frame.dataset.pageNumber)
      state.renderTasks.get(`continuous-${pageNumber}`)?.cancel()
      state.renderTasks.delete(`continuous-${pageNumber}`)
      canvas.remove()
      frame.classList.add("pdf-page-placeholder")
    }
  }
}

function scheduleVisiblePages(state) {
  cancelAnimationFrame(state.continuousFrame)
  state.continuousFrame = requestAnimationFrame(() => renderVisiblePages(state))
}

function scrollToPage(state, pageNumber) {
  const target = state.pageElements[Math.max(0, pageNumber - 1)]
  if (!target) return
  state.pageNumber = pageNumber
  state.stage.scrollTo({ top: target.offsetTop, behavior: "smooth" })
  updateControls(state)
  scheduleVisiblePages(state)
}

function changePage(state, direction) {
  if (!state.document) return
  const step = state.columns
  const pageNumber = Math.max(
    1,
    Math.min(state.document.numPages, state.pageNumber + direction * step),
  )
  if (pageNumber === state.pageNumber) return
  if (isFocused(state)) scrollToPage(state, pageNumber)
  else {
    state.pageNumber = pageNumber
    updateControls(state)
    schedulePreview(state)
  }
}

function setZoom(state, zoom) {
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
  if (nextZoom === state.zoom) return
  state.zoom = nextZoom
  updateControls(state)
  if (isFocused(state)) createContinuousPages(state)
  else schedulePreview(state)
}

function closeOtherViewers(state) {
  for (const other of viewers) {
    if (other === state || !isFocused(other)) continue
    other.root.classList.remove("is-focused")
    other.focus.textContent = "⛶"
    other.focus.setAttribute("aria-label", "PDF im Fokusmodus öffnen")
    other.focus.title = "Fokusmodus"
    other.zoom = 1
    schedulePreview(other)
  }
}

function setFocused(state, focused) {
  if (focused) closeOtherViewers(state)
  state.root.classList.toggle("is-focused", focused)
  state.focus.textContent = focused ? "×" : "⛶"
  state.focus.setAttribute(
    "aria-label",
    focused ? "PDF-Fokusmodus schließen" : "PDF im Fokusmodus öffnen",
  )
  state.focus.title = focused ? "Fokusmodus schließen" : "Fokusmodus"
  state.zoom = 1
  document.body.classList.toggle(
    "pdf-focus-active",
    [...viewers].some((viewer) => isFocused(viewer)),
  )
  if (focused) createContinuousPages(state)
  else schedulePreview(state)
}

async function setupViewer(root) {
  root.dataset.pdfViewerReady = "true"
  const source = root.querySelector(".pdf-open")?.href || root.dataset.pdfSrc
  const stage = root.querySelector(".pdf-viewer-stage")
  const pages = root.querySelector(".pdf-pages")
  const loading = root.querySelector(".pdf-loading")
  const previous = root.querySelector(".pdf-previous")
  const next = root.querySelector(".pdf-next")
  const status = root.querySelector(".pdf-page-status")
  const focus = root.querySelector(".pdf-focus")
  const zoomOut = root.querySelector(".pdf-zoom-out")
  const zoomReset = root.querySelector(".pdf-zoom-reset")
  const zoomIn = root.querySelector(".pdf-zoom-in")
  const zoomStatus = root.querySelector(".pdf-zoom-status")
  if (
    !source ||
    !stage ||
    !pages ||
    !loading ||
    !previous ||
    !next ||
    !status ||
    !focus ||
    !zoomOut ||
    !zoomReset ||
    !zoomIn ||
    !zoomStatus
  ) {
    return
  }

  const state = {
    root,
    stage,
    pages,
    loading,
    previous,
    next,
    status,
    focus,
    zoomOut,
    zoomReset,
    zoomIn,
    zoomStatus,
    document: null,
    firstViewport: null,
    pageElements: [],
    pageNumber: 1,
    columns: 1,
    zoom: 1,
    renderGeneration: 0,
    continuousGeneration: 0,
    renderTasks: new Map(),
    frame: 0,
    continuousFrame: 0,
    resizeFrame: 0,
    lastStageWidth: 0,
    lastStageHeight: 0,
    resizeObserver: null,
  }
  viewers.add(state)
  updateControls(state)

  previous.addEventListener("click", () => changePage(state, -1))
  next.addEventListener("click", () => changePage(state, 1))
  zoomOut.addEventListener("click", () => setZoom(state, state.zoom - ZOOM_STEP))
  zoomReset.addEventListener("click", () => setZoom(state, 1))
  zoomIn.addEventListener("click", () => setZoom(state, state.zoom + ZOOM_STEP))
  focus.addEventListener("click", () => setFocused(state, !isFocused(state)))
  stage.addEventListener("scroll", () => scheduleVisiblePages(state), { passive: true })

  state.resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(state.resizeFrame)
    state.resizeFrame = requestAnimationFrame(() => {
      const width = state.stage.clientWidth
      const height = state.stage.clientHeight
      if (
        Math.abs(width - state.lastStageWidth) < 2 &&
        Math.abs(height - state.lastStageHeight) < 2
      ) {
        return
      }
      state.lastStageWidth = width
      state.lastStageHeight = height
      if (!state.document) return
      if (isFocused(state)) createContinuousPages(state)
      else schedulePreview(state)
    })
  })
  state.resizeObserver.observe(stage)

  try {
    state.document = await pdfjsLib.getDocument({
      url: source,
      cMapUrl: staticAssetUrl("cmaps"),
      cMapPacked: true,
      standardFontDataUrl: staticAssetUrl("standard_fonts"),
      wasmUrl: staticAssetUrl("wasm"),
    }).promise
    const firstPage = await state.document.getPage(1)
    state.firstViewport = firstPage.getViewport({ scale: 1 })
    state.lastStageWidth = state.stage.clientWidth
    state.lastStageHeight = state.stage.clientHeight
    schedulePreview(state)
  } catch (error) {
    console.warn("[PdfViewer] PDF konnte nicht geladen werden", error)
    loading.textContent = "PDF-Vorschau konnte nicht geladen werden."
  }
}

function cleanupDetachedViewers() {
  for (const state of viewers) {
    if (state.root.isConnected) continue
    state.resizeObserver?.disconnect()
    cancelRenderTasks(state)
    state.document?.destroy()
    cancelAnimationFrame(state.frame)
    cancelAnimationFrame(state.continuousFrame)
    cancelAnimationFrame(state.resizeFrame)
    viewers.delete(state)
  }
  if (![...viewers].some((state) => isFocused(state))) {
    document.body.classList.remove("pdf-focus-active")
  }
}

function initializePdfViewers() {
  cleanupDetachedViewers()
  for (const root of document.querySelectorAll(".pdf-embed:not([data-pdf-viewer-ready])")) {
    setupViewer(root)
  }
}

document.addEventListener("nav", initializePdfViewers)
document.addEventListener("render", initializePdfViewers)
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return
  const focused = [...viewers].find((state) => isFocused(state))
  if (!focused) return
  event.preventDefault()
  setFocused(focused, false)
  focused.focus.focus()
})
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePdfViewers, { once: true })
} else {
  initializePdfViewers()
}
