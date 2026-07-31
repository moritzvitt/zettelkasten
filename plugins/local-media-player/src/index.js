import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { visit } from "unist-util-visit"

const markerOrigin = "https://local-media.invalid"
const defaultOptions = {
  mediaRoot: "/Users/moritzvitt/Notes/Obsidian Notes/Digital Garden/media-lib/Media",
  route: "/local-media",
  copyMedia: false,
  aliasManifest: "private/local-media-aliases.json",
}

function wikilinkTarget(value) {
  if (typeof value !== "string") return null
  const match = value.match(/^\[\[([\s\S]*?)\]\]$/)
  if (!match) return null

  const target = match[1].split(/[|#]/, 1)[0].trim()
  return target || null
}

function frontmatter(src) {
  const match = src.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return null
  try {
    return YAML.parse(match[1]) || null
  } catch {
    return null
  }
}

function sameMediaTarget(left, right) {
  return (
    left.replaceAll("\\", "/").toLocaleLowerCase() ===
    right.replaceAll("\\", "/").toLocaleLowerCase()
  )
}

export function rewriteMediaTimestampLinks(src) {
  const data = frontmatter(src)
  const mediaLinkTarget = wikilinkTarget(data?.media)
  if (!mediaLinkTarget) return src

  return src.replace(
    /\[\[([^\n]*?)#t=([0-9]+(?:\.[0-9]+)?)(?:\|([^\]\n]+))?\]\]/g,
    (full, linkTarget, seconds, alias) => {
      if (!sameMediaTarget(linkTarget.trim(), mediaLinkTarget)) return full
      const label = alias?.trim() || seconds
      const markedTarget = encodeURIComponent(mediaLinkTarget)
      return `[${label}](${markerOrigin}/${markedTarget}?t=${seconds})`
    },
  )
}

function mediaTitleFromAlt(value) {
  const title = String(value ?? "").trim()
  return /^\d+(?:\.\d+)?x\d+(?:\.\d+)?$/i.test(title) ? "" : title
}

function youtubeAudioMarkerUrl(src, title = "") {
  const url = new URL(`${markerOrigin}/youtube-audio`)
  url.searchParams.set("src", src)
  if (title) url.searchParams.set("title", title)
  return url.href
}

export function rewriteMediaExtendedAudioEmbeds(src) {
  return src.replace(/!\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)\)/g, (full, alt, url) => {
    if (youtubeId(url) === null || mediaExtendedMode(url) !== "audio") return full
    const title = mediaTitleFromAlt(alt)
    return `![${title || "YouTube audio"}](${youtubeAudioMarkerUrl(url, title)})`
  })
}

function encodePathSegment(segment) {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function localMediaUrl(route, relativePath) {
  const base = `/${route.replace(/^\/+|\/+$/g, "")}`
  const encoded = relativePath.split(path.sep).map(encodePathSegment).join("/")
  return `${base}/${encoded}`
}

function localMediaOutputPath(output, route, url) {
  const routeBase = `/${route.replace(/^\/+|\/+$/g, "")}/`
  if (!url.startsWith(routeBase)) return null
  const relative = decodeURIComponent(url.slice(1))
  return path.join(output, relative)
}

function youtubeId(value) {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const url = new URL(value)
    const hostname = url.hostname.replace(/^www\./, "")
    if (hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || null
    if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      if (url.pathname === "/watch") return url.searchParams.get("v")
      const embed = url.pathname.match(/^\/embed\/([^/?#]+)/)
      if (embed) return embed[1]
      const shorts = url.pathname.match(/^\/shorts\/([^/?#]+)/)
      if (shorts) return shorts[1]
    }
  } catch {}
  return null
}

function secondsFromParams(params) {
  const raw = params.get("t") || params.get("start")
  if (!raw) return null
  const seconds = Number(raw.replace(/s$/i, ""))
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

function youtubeSeconds(value) {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value)
    return (
      secondsFromParams(url.searchParams) ??
      secondsFromParams(new URLSearchParams(url.hash.slice(1)))
    )
  } catch {
    return null
  }
}

function mediaSeconds(value) {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value, markerOrigin)
    const parameterSeconds =
      secondsFromParams(url.searchParams) ??
      secondsFromParams(new URLSearchParams(url.hash.slice(1)))
    if (parameterSeconds !== null) return parameterSeconds

    const compactHash = url.hash.match(/^#t=?([0-9]+(?:\.[0-9]+)?)s?$/i)
    if (!compactHash) return null
    const seconds = Number(compactHash[1])
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
  } catch {
    return null
  }
}

function sameMediaResource(left, right) {
  try {
    const normalize = (value) => {
      const url = new URL(value, markerOrigin)
      url.hash = ""
      url.searchParams.delete("t")
      url.searchParams.delete("start")
      return url.href
    }
    return normalize(left) === normalize(right)
  } catch {
    return false
  }
}

function youtubeEmbedUrl(id, start = null) {
  const url = new URL(`https://www.youtube.com/embed/${encodeURIComponent(id)}`)
  url.searchParams.set("enablejsapi", "1")
  url.searchParams.set("playsinline", "1")
  if (Number.isFinite(start) && start > 0) url.searchParams.set("start", String(Math.floor(start)))
  return url.href
}

function withYoutubeApi(value) {
  try {
    const url = new URL(value)
    url.searchParams.set("enablejsapi", "1")
    return url.href
  } catch {
    return value
  }
}

export function resolveMediaFile(filePath, mediaValue, mediaRoot, route) {
  const mediaTarget = wikilinkTarget(mediaValue)
  if (!filePath || !mediaTarget) return null

  let sourceFile
  try {
    sourceFile = fs.realpathSync(filePath)
  } catch {
    return null
  }

  let resolvedRoot
  try {
    resolvedRoot = fs.realpathSync(mediaRoot)
  } catch {
    return null
  }
  const mediaFile = path.resolve(path.dirname(sourceFile), mediaTarget)
  const relativePath = path.relative(resolvedRoot, mediaFile)
  if (
    !relativePath ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === ".." ||
    path.isAbsolute(relativePath) ||
    !fs.existsSync(mediaFile)
  ) {
    return null
  }

  return {
    type: "local",
    file: mediaFile,
    target: mediaTarget,
    url: localMediaUrl(route, relativePath),
  }
}

export function resolveMedia(filePath, mediaValue, mediaRoot, route) {
  const youtube = youtubeId(mediaValue)
  if (youtube) {
    const start = youtubeSeconds(mediaValue)
    return {
      type: "youtube",
      target: mediaValue.trim(),
      url: `https://www.youtube.com/watch?v=${youtube}`,
      embedUrl: youtubeEmbedUrl(youtube, start),
      youtube,
    }
  }
  return resolveMediaFile(filePath, mediaValue, mediaRoot, route)
}

function resolveAliasedMedia(mediaValue, route, aliasManifest) {
  if (typeof mediaValue !== "string") return null
  const routeBase = `/${route.replace(/^\/+|\/+$/g, "")}/`
  let alias
  try {
    alias = new URL(mediaValue, "https://local-media.invalid").pathname
  } catch {
    return null
  }
  if (!alias.startsWith(routeBase)) return null

  let manifest
  try {
    const manifestPath = path.resolve(aliasManifest)
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  } catch {
    return null
  }

  const mediaFile = manifest?.aliases?.[alias]
  if (typeof mediaFile !== "string" || !fs.existsSync(mediaFile)) return null
  return { type: "local", file: mediaFile, target: alias, url: alias }
}

function resolveConfiguredMedia(filePath, mediaValue, options) {
  return (
    resolveAliasedMedia(mediaValue, options.route, options.aliasManifest) ||
    resolveMedia(filePath, mediaValue, options.mediaRoot, options.route)
  )
}

function sourceFilePath(generatedFilePath, sourceValue, mediaRoot) {
  if (typeof sourceValue !== "string" || !sourceValue.trim()) return generatedFilePath

  const normalizedSource = sourceValue.replaceAll("\\", "/").replace(/^\/+/, "")
  let normalizedMediaRoot
  try {
    normalizedMediaRoot = fs.realpathSync(mediaRoot).replaceAll("\\", "/")
  } catch {
    return generatedFilePath
  }

  const marker = "/Digital Garden/"
  const markerIndex = normalizedMediaRoot.indexOf(marker)
  if (markerIndex === -1) return generatedFilePath

  const vaultRoot = normalizedMediaRoot.slice(0, markerIndex)
  const sourcePath = path.join(vaultRoot, normalizedSource)
  return fs.existsSync(sourcePath) ? sourcePath : generatedFilePath
}

function classNames(node) {
  const value = node.properties?.className ?? node.properties?.class
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean)
  return []
}

function isMarkedTimestamp(node) {
  if (node.tagName !== "a" || typeof node.properties?.href !== "string") return false
  return node.properties.href.startsWith(`${markerOrigin}/`)
}

function timestampFrom(node) {
  try {
    const url = new URL(node.properties.href, markerOrigin)
    const seconds = Number(url.searchParams.get("t"))
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
  } catch {
    return null
  }
}

function markedTimestampTarget(node) {
  try {
    const url = new URL(node.properties.href, markerOrigin)
    const target = decodeURIComponent(url.pathname.replace(/^\//, ""))
    return target.startsWith("/") ? target : null
  } catch {
    return null
  }
}

function markTimestampLink(node, href, seconds) {
  node.properties.href = `#t=${seconds}`
  node.properties["data-media-time"] = String(seconds)
  node.properties["data-media-url"] = href.replace(/#.*$/, "")
  node.properties["data-router-ignore"] = ""
  node.properties.className = ["local-media-timestamp"]
  node.children = node.children.filter(
    (child) =>
      !(
        child.type === "element" &&
        child.tagName === "svg" &&
        classNames(child).includes("external-icon")
      ),
  )
}

function youtubeTimestampFrom(node, media) {
  if (node.tagName !== "a" || typeof node.properties?.href !== "string") return null
  if (media.type !== "youtube") return null
  if (youtubeId(node.properties.href) !== media.youtube) return null
  return youtubeSeconds(node.properties.href)
}

function localTimestampFrom(node, media) {
  if (
    media.type !== "local" ||
    node.tagName !== "a" ||
    typeof node.properties?.href !== "string" ||
    !sameMediaResource(node.properties.href, media.url)
  ) {
    return null
  }
  return mediaSeconds(node.properties.href)
}

function mediaExtendedMode(value) {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value)
    return new URLSearchParams(url.hash.slice(1)).get("as")
  } catch {
    return null
  }
}

function isYoutubeAudioEmbed(node) {
  return (
    ((node.tagName === "img" && typeof node.properties?.src === "string") ||
      (node.tagName === "iframe" && typeof node.properties?.src === "string")) &&
    youtubeId(node.properties.src) !== null &&
    mediaExtendedMode(node.properties.src) === "audio"
  )
}

function isYoutubeAudioPlaceholder(node) {
  return (
    ((node.tagName === "span" && typeof node.properties?.["data-local-media-audio"] === "string") ||
      (node.tagName === "img" &&
        typeof node.properties?.src === "string" &&
        node.properties.src.startsWith(`${markerOrigin}/youtube-audio`))) &&
    youtubeId(youtubeAudioPlaceholderSource(node)) !== null
  )
}

function youtubeAudioPlaceholderSource(node) {
  if (node.tagName === "span") return node.properties?.["data-local-media-audio"] ?? null
  try {
    return new URL(node.properties.src).searchParams.get("src")
  } catch {
    return null
  }
}

function youtubeAudioPlaceholderTitle(node) {
  if (node.tagName === "span") return node.properties?.["data-local-media-title"] ?? ""
  try {
    return new URL(node.properties.src).searchParams.get("title") || node.properties.alt || ""
  } catch {
    return node.properties?.alt ?? ""
  }
}

function youtubeAudioElement(src, label = "") {
  const youtube = youtubeId(src)
  if (!youtube) return null
  const start = youtubeSeconds(src) ?? 0
  const title = String(label || "YouTube audio").trim()
  const mediaUrl = `https://www.youtube.com/watch?v=${youtube}`

  return {
    type: "element",
    tagName: "figure",
    properties: {
      className: ["local-media-player", "local-media-audio-card"],
      "data-media-url": mediaUrl,
      "data-media-time": String(start),
    },
    children: [
      {
        type: "element",
        tagName: "iframe",
        properties: {
          className: ["local-media-youtube", "local-media-youtube-audio-frame"],
          allow: "fullscreen; autoplay",
          frameBorder: "0",
          src: youtubeEmbedUrl(youtube, start),
          title,
        },
        children: [],
      },
      {
        type: "element",
        tagName: "div",
        properties: { className: ["local-media-audio-ui"] },
        children: [
          {
            type: "element",
            tagName: "img",
            properties: {
              className: ["local-media-audio-cover"],
              src: `https://i.ytimg.com/vi/${encodeURIComponent(youtube)}/default.jpg`,
              alt: "",
              loading: "lazy",
            },
            children: [],
          },
          {
            type: "element",
            tagName: "div",
            properties: { className: ["local-media-audio-main"] },
            children: [
              {
                type: "element",
                tagName: "div",
                properties: { className: ["local-media-audio-meta"] },
                children: [
                  {
                    type: "element",
                    tagName: "span",
                    properties: { className: ["local-media-audio-title"] },
                    children: [{ type: "text", value: title }],
                  },
                  {
                    type: "element",
                    tagName: "span",
                    properties: { className: ["local-media-audio-source"] },
                    children: [{ type: "text", value: "YouTube" }],
                  },
                  {
                    type: "element",
                    tagName: "time",
                    properties: { className: ["local-media-audio-current-time"] },
                    children: [{ type: "text", value: formatSeconds(start) }],
                  },
                  {
                    type: "element",
                    tagName: "time",
                    properties: { className: ["local-media-audio-duration"] },
                    children: [{ type: "text", value: "--:--" }],
                  },
                ],
              },
              {
                type: "element",
                tagName: "input",
                properties: {
                  type: "range",
                  className: ["local-media-audio-progress"],
                  min: "0",
                  max: String(Math.max(300, Math.ceil(start + 300))),
                  step: "1",
                  value: String(Math.floor(start)),
                  "aria-label": "Wiedergabeposition",
                },
                children: [],
              },
              {
                type: "element",
                tagName: "div",
                properties: { className: ["local-media-audio-controls"] },
                children: [
                  audioButton("back", "15s zurueck", "-15"),
                  audioButton("play", "Abspielen", "Play"),
                  audioButton("forward", "15s vor", "+15"),
                ],
              },
            ],
          },
          {
            type: "element",
            tagName: "a",
            properties: {
              className: ["local-media-audio-open"],
              href: mediaUrl,
              target: "_blank",
              rel: "noopener noreferrer",
              "aria-label": "Auf YouTube oeffnen",
            },
            children: [{ type: "text", value: "Open" }],
          },
        ],
      },
    ],
  }
}

function audioButton(action, label, text) {
  return {
    type: "element",
    tagName: "button",
    properties: {
      type: "button",
      className: ["local-media-audio-button", `local-media-audio-${action}`],
      "data-local-media-action": action,
      "aria-label": label,
    },
    children: [{ type: "text", value: text }],
  }
}

function formatSeconds(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function replaceYoutubeAudioEmbeds(tree) {
  visit(tree, "element", (node, index, parent) => {
    if (!parent || index === undefined) return
    const source = isYoutubeAudioPlaceholder(node)
      ? youtubeAudioPlaceholderSource(node)
      : isYoutubeAudioEmbed(node)
        ? node.properties.src
        : null
    if (!source) return
    const label = isYoutubeAudioPlaceholder(node)
      ? youtubeAudioPlaceholderTitle(node)
      : node.properties.alt
    const replacement = youtubeAudioElement(source, label)
    if (replacement) parent.children[index] = replacement
  })
}

const playerScript = `
const localMediaChannelName = "local-media-player-v1"
const localMediaChannel = "BroadcastChannel" in window
  ? new BroadcastChannel(localMediaChannelName)
  : null

function normalizedMediaUrl(value) {
  if (!value) return null
  try {
    const url = new URL(value, location.href)
    url.hash = ""
    return url.href
  } catch {
    return null
  }
}

function youtubeVideoId(value) {
  if (!value) return null
  try {
    const url = new URL(value, location.href)
    const hostname = url.hostname.replace(/^www\\./, "")
    if (hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || null
    if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      if (url.pathname === "/watch") return url.searchParams.get("v")
      const embed = url.pathname.match(/^\\/embed\\/([^/?#]+)/)
      if (embed) return embed[1]
      const shorts = url.pathname.match(/^\\/shorts\\/([^/?#]+)/)
      if (shorts) return shorts[1]
    }
  } catch {}
  return null
}

function sameYoutubeVideo(left, right) {
  const leftId = youtubeVideoId(left)
  return leftId !== null && leftId === youtubeVideoId(right)
}

function postYoutubeCommand(frame, func, args = []) {
  frame.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func, args }),
    "https://www.youtube.com",
  )
}

let youtubeIframeApiPromise = null
const audioCardPlayers = new WeakMap()

function loadYoutubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise

  youtubeIframeApiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === "function") previous()
      resolve(window.YT)
    }
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
    if (!existing) {
      const script = document.createElement("script")
      script.src = "https://www.youtube.com/iframe_api"
      document.head.appendChild(script)
    }
  })
  return youtubeIframeApiPromise
}

var lastActiveMediaTarget = null
var youtubeVideoPlaying = new WeakMap()

function mediaTargetUrl(target) {
  if (target instanceof HTMLMediaElement) return target.currentSrc || target.src
  if (target instanceof HTMLIFrameElement) return target.src
  if (target instanceof HTMLElement && target.classList.contains("local-media-audio-card")) {
    var frame = target.querySelector(".local-media-youtube-audio-frame")
    return target.dataset.mediaUrl || (frame instanceof HTMLIFrameElement ? frame.src : null)
  }
  return null
}

function mediaTargetMatches(target, mediaUrl) {
  var targetUrl = mediaTargetUrl(target)
  if (!targetUrl) return false
  if (
    target instanceof HTMLIFrameElement ||
    (target instanceof HTMLElement && target.classList.contains("local-media-audio-card"))
  ) {
    if (sameYoutubeVideo(targetUrl, mediaUrl)) return true
  }
  return normalizedMediaUrl(targetUrl) === normalizedMediaUrl(mediaUrl)
}

function matchingMediaTargets(mediaUrl) {
  return [
    ...document.querySelectorAll("video.local-media-video, audio.local-media-audio"),
    ...document.querySelectorAll(
      "iframe.local-media-youtube:not(.local-media-youtube-audio-frame)",
    ),
    ...document.querySelectorAll(".local-media-audio-card"),
  ].filter((target) => mediaTargetMatches(target, mediaUrl))
}

function mediaTargetIsPlaying(target) {
  if (target instanceof HTMLMediaElement) return !target.paused && !target.ended
  if (target instanceof HTMLIFrameElement) return youtubeVideoPlaying.get(target) === true
  return target instanceof HTMLElement && target.dataset.playing === "true"
}

function selectMediaTarget(mediaUrl) {
  var matches = matchingMediaTargets(mediaUrl)
  if (matches.length === 0) return null

  var playing = matches.filter(mediaTargetIsPlaying)
  if (lastActiveMediaTarget && playing.includes(lastActiveMediaTarget)) {
    return lastActiveMediaTarget
  }
  if (playing.length > 0) return playing[0]
  if (matches.length === 1) return matches[0]
  if (lastActiveMediaTarget && matches.includes(lastActiveMediaTarget)) {
    return lastActiveMediaTarget
  }
  return null
}

function seekAudioCard(card, seconds, options = {}) {
  var frame = card.querySelector(".local-media-youtube-audio-frame")
  if (!(frame instanceof HTMLIFrameElement)) return false
  postYoutubeCommand(frame, "seekTo", [seconds, true])
  if (options.play) postYoutubeCommand(frame, "playVideo")
  var state = audioCardState(card)
  state.current = seconds
  if (options.play) state.playing = true
  updateAudioCard(card, state)
  setAudioTimer(card, state.playing)
  if (options.scroll) card.scrollIntoView({ behavior: "smooth", block: "center" })
  return true
}

function seekMediaTarget(target, seconds, options = {}) {
  if (target instanceof HTMLMediaElement) {
    const seek = () => {
      target.currentTime = seconds
      if (options.play) target.play().catch(() => {})
      if (options.scroll) target.scrollIntoView({ behavior: "smooth", block: "center" })
    }
    if (target.readyState >= 1) seek()
    else target.addEventListener("loadedmetadata", seek, { once: true })
    return true
  }
  if (target instanceof HTMLIFrameElement) {
    postYoutubeCommand(target, "seekTo", [seconds, true])
    if (options.play) postYoutubeCommand(target, "playVideo")
    if (options.scroll) target.scrollIntoView({ behavior: "smooth", block: "center" })
    return true
  }
  if (target instanceof HTMLElement && target.classList.contains("local-media-audio-card")) {
    return seekAudioCard(target, seconds, options)
  }
  return false
}

function seekMediaPlayer(seconds, mediaUrl, options = {}) {
  const target = selectMediaTarget(mediaUrl)
  if (!target) return false
  lastActiveMediaTarget = target
  return seekMediaTarget(target, seconds, options)
}

function seekFromLocation() {
  const initial = Number(new URLSearchParams(location.hash.slice(1)).get("t"))
  if (!Number.isFinite(initial) || initial <= 0) return
  const target =
    lastActiveMediaTarget ||
    document.querySelector(
      "video.local-media-video, audio.local-media-audio, iframe.local-media-youtube, .local-media-audio-card",
    )
  const mediaUrl = target ? mediaTargetUrl(target) : null
  if (mediaUrl) seekMediaPlayer(initial, mediaUrl, { scroll: true })
}

localMediaChannel?.addEventListener("message", (event) => {
  const message = event.data
  if (
    message?.type !== "seek" ||
    !Number.isFinite(message.seconds) ||
    message.seconds < 0
  ) {
    return
  }
  seekMediaPlayer(message.seconds, message.mediaUrl)
})

document.addEventListener("click", (event) => {
  const target = event.target
  const link = target instanceof Element
    ? target.closest("a.local-media-timestamp")
    : null
  if (!(link instanceof HTMLAnchorElement)) return

  const seconds = Number(link.dataset.mediaTime)
  const mediaUrl = normalizedMediaUrl(link.dataset.mediaUrl || link.href)
  if (!Number.isFinite(seconds) || !mediaUrl) return

  event.preventDefault()
  event.stopImmediatePropagation()
  localMediaChannel?.postMessage({ type: "seek", mediaUrl, seconds })
  seekMediaPlayer(seconds, mediaUrl)
  history.replaceState(null, "", "#t=" + seconds)
}, true)

document.addEventListener("play", (event) => {
  const target = event.target
  if (
    target instanceof HTMLMediaElement &&
    (target.classList.contains("local-media-video") ||
      target.classList.contains("local-media-audio"))
  ) {
    lastActiveMediaTarget = target
  }
}, true)

document.addEventListener("auxclick", (event) => {
  const target = event.target
  const link = target instanceof Element
    ? target.closest("a.local-media-timestamp")
    : null
  if (!(link instanceof HTMLAnchorElement)) return
  event.preventDefault()
  event.stopImmediatePropagation()
}, true)

function formatMediaTime(value) {
  var total = Math.max(0, Math.floor(Number(value) || 0))
  var minutes = Math.floor(total / 60)
  var seconds = total % 60
  return minutes + ":" + String(seconds).padStart(2, "0")
}

function audioCardState(card) {
  var current = Number(card.dataset.mediaTime)
  var duration = Number(card.dataset.mediaDuration)
  return {
    current: Number.isFinite(current) && current >= 0 ? current : 0,
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    playing: card.dataset.playing === "true",
  }
}

function updateAudioCard(card, state) {
  card.dataset.mediaTime = String(Math.max(0, state.current))
  if (Number.isFinite(state.duration) && state.duration > 0) {
    card.dataset.mediaDuration = String(state.duration)
  }
  card.dataset.playing = state.playing ? "true" : "false"
  var time = card.querySelector(".local-media-audio-current-time")
  if (time) time.textContent = formatMediaTime(state.current)
  var duration = card.querySelector(".local-media-audio-duration")
  if (duration) duration.textContent = state.duration ? formatMediaTime(state.duration) : "--:--"
  var progress = card.querySelector(".local-media-audio-progress")
  if (progress instanceof HTMLInputElement) {
    var max = Math.max(Number(progress.max) || 0, state.duration || 0, state.current + 60, 300)
    progress.max = String(Math.ceil(max))
    progress.value = String(Math.floor(state.current))
    progress.style.setProperty("--progress", String(Math.min(100, (state.current / max) * 100)) + "%")
  }
  var play = card.querySelector('[data-local-media-action="play"]')
  if (play) {
    play.textContent = state.playing ? "Pause" : "Play"
    play.setAttribute("aria-label", state.playing ? "Pausieren" : "Abspielen")
  }
}

function updateAudioCardDuration(card, player) {
  if (!player || typeof player.getDuration !== "function") return
  var duration = Number(player.getDuration())
  if (!Number.isFinite(duration) || duration <= 0) return
  var state = audioCardState(card)
  state.duration = duration
  if (state.current > duration) state.current = duration
  updateAudioCard(card, state)
}

function hydrateAudioCards() {
  document.querySelectorAll(".local-media-audio-card").forEach((card) => {
    if (!(card instanceof HTMLElement) || audioCardPlayers.has(card)) return
    var frame = card.querySelector(".local-media-youtube-audio-frame")
    if (!(frame instanceof HTMLIFrameElement)) return

    loadYoutubeIframeApi().then((YT) => {
      if (!YT?.Player || audioCardPlayers.has(card)) return
      var player = new YT.Player(frame, {
        events: {
          onReady: () => updateAudioCardDuration(card, player),
          onStateChange: (event) => {
            updateAudioCardDuration(card, player)
            var state = audioCardState(card)
            state.playing = event.data === 1
            if (state.playing) lastActiveMediaTarget = card
            updateAudioCard(card, state)
            setAudioTimer(card, state.playing)
          },
        },
      })
      audioCardPlayers.set(card, player)
    })
  })
}

var youtubeVideoPlayers = new WeakMap()

function hydrateYoutubeVideoFrames() {
  document
    .querySelectorAll("iframe.local-media-youtube:not(.local-media-youtube-audio-frame)")
    .forEach((frame) => {
      if (!(frame instanceof HTMLIFrameElement) || youtubeVideoPlayers.has(frame)) return
      loadYoutubeIframeApi().then((YT) => {
        if (!YT?.Player || youtubeVideoPlayers.has(frame)) return
        var player = new YT.Player(frame, {
          events: {
            onStateChange: (event) => {
              var playing = event.data === 1
              youtubeVideoPlaying.set(frame, playing)
              if (playing) lastActiveMediaTarget = frame
            },
          },
        })
        youtubeVideoPlayers.set(frame, player)
      })
    })
}

var localAudioTimers = new WeakMap()

function setAudioTimer(card, enabled) {
  var existing = localAudioTimers.get(card)
  if (existing) {
    window.clearInterval(existing)
    localAudioTimers.delete(card)
  }
  if (!enabled) return
  localAudioTimers.set(
    card,
    window.setInterval(function () {
      var state = audioCardState(card)
      state.current += 1
      state.playing = true
      updateAudioCard(card, state)
    }, 1000),
  )
}

document.addEventListener("click", (event) => {
  const target = event.target
  const button = target instanceof Element
    ? target.closest("[data-local-media-action]")
    : null
  if (!(button instanceof HTMLElement)) return

  const card = button.closest(".local-media-audio-card")
  if (!(card instanceof HTMLElement)) return
  const frame = card.querySelector(".local-media-youtube-audio-frame")
  if (!(frame instanceof HTMLIFrameElement)) return

  event.preventDefault()
  event.stopImmediatePropagation()

  const action = button.dataset.localMediaAction
  const state = audioCardState(card)
  if (action === "play") {
    state.playing = !state.playing
    postYoutubeCommand(frame, state.playing ? "playVideo" : "pauseVideo")
    setAudioTimer(card, state.playing)
    if (state.playing) lastActiveMediaTarget = card
  } else if (action === "back" || action === "forward") {
    state.current += action === "back" ? -15 : 15
    state.current = Math.max(0, state.current)
    postYoutubeCommand(frame, "seekTo", [state.current, true])
  } else {
    return
  }
  updateAudioCard(card, state)
}, true)

document.addEventListener("input", (event) => {
  const target = event.target
  if (!(target instanceof HTMLInputElement) || !target.classList.contains("local-media-audio-progress")) return

  const card = target.closest(".local-media-audio-card")
  if (!(card instanceof HTMLElement)) return
  const state = audioCardState(card)
  state.current = Math.max(0, Number(target.value) || 0)
  updateAudioCard(card, state)
}, true)

document.addEventListener("change", (event) => {
  const target = event.target
  if (!(target instanceof HTMLInputElement) || !target.classList.contains("local-media-audio-progress")) return

  const card = target.closest(".local-media-audio-card")
  if (!(card instanceof HTMLElement)) return
  const frame = card.querySelector(".local-media-youtube-audio-frame")
  if (!(frame instanceof HTMLIFrameElement)) return

  const state = audioCardState(card)
  state.current = Math.max(0, Number(target.value) || 0)
  postYoutubeCommand(frame, "seekTo", [state.current, true])
  updateAudioCard(card, state)
}, true)

document.addEventListener("nav", seekFromLocation)
document.addEventListener("render", seekFromLocation)
document.addEventListener("nav", hydrateAudioCards)
document.addEventListener("render", hydrateAudioCards)
document.addEventListener("nav", hydrateYoutubeVideoFrames)
document.addEventListener("render", hydrateYoutubeVideoFrames)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    hydrateAudioCards()
    hydrateYoutubeVideoFrames()
    seekFromLocation()
  }, { once: true })
} else {
  hydrateAudioCards()
  hydrateYoutubeVideoFrames()
  seekFromLocation()
}
`

const playerStyle = `
.local-media-player {
  margin: 0 0 1.5rem;
}

.local-media-video {
  display: block;
  width: 100%;
  max-height: min(72vh, 760px);
  border-radius: 0.65rem;
  background: #000;
}

.local-media-youtube {
  aspect-ratio: 16 / 9;
  display: block;
  width: 100%;
  border-radius: 0.65rem;
  background: #000;
}

.local-media-player figcaption {
  margin-top: 0.35rem;
  color: var(--gray);
  font-size: 0.85rem;
}

.local-media-audio-card {
  position: relative;
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  background: var(--light);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.local-media-youtube-audio-frame {
  position: absolute;
  width: 1px;
  height: 1px;
  border: 0;
  opacity: 0.01;
  pointer-events: none;
}

.local-media-audio-ui {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 4.5rem;
  padding: 0.7rem 0.8rem;
}

.local-media-audio-cover {
  width: 3rem;
  height: 3rem;
  flex: 0 0 auto;
  border-radius: 0.45rem;
  object-fit: cover;
  background: var(--lightgray);
}

.local-media-audio-main {
  min-width: 0;
  flex: 1 1 auto;
}

.local-media-audio-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 0.75rem;
  align-items: baseline;
}

.local-media-audio-title {
  overflow: hidden;
  color: var(--dark);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-media-audio-source,
.local-media-audio-current-time,
.local-media-audio-duration {
  color: var(--gray);
  font-size: 0.85rem;
  white-space: nowrap;
}

.local-media-audio-current-time,
.local-media-audio-duration {
  color: var(--dark);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.local-media-audio-duration::before {
  content: "/";
  color: var(--gray);
  margin-right: 0.35rem;
  font-weight: 400;
}

.local-media-audio-progress {
  --progress: 0%;
  display: block;
  width: 100%;
  height: 0.4rem;
  margin-top: 0.55rem;
  appearance: none;
  border-radius: 999px;
  background:
    linear-gradient(90deg, var(--secondary) 0 var(--progress), var(--lightgray) var(--progress) 100%);
  cursor: pointer;
}

.local-media-audio-progress::-webkit-slider-thumb {
  appearance: none;
  width: 0.9rem;
  height: 0.9rem;
  border: 2px solid var(--light);
  border-radius: 50%;
  background: var(--secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.24);
}

.local-media-audio-progress::-moz-range-thumb {
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid var(--light);
  border-radius: 50%;
  background: var(--secondary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.24);
}

.local-media-audio-controls {
  display: flex;
  justify-content: center;
  gap: 0.55rem;
  margin-top: 0.55rem;
}

.local-media-audio-button,
.local-media-audio-open {
  border: 1px solid var(--lightgray);
  border-radius: 999px;
  background: var(--light);
  color: var(--dark);
  cursor: pointer;
  font: inherit;
  font-size: 0.82rem;
  line-height: 1;
  padding: 0.4rem 0.6rem;
  text-decoration: none;
}

.local-media-audio-play {
  min-width: 4.25rem;
}

.local-media-audio-open {
  flex: 0 0 auto;
}

@media (max-width: 620px) {
  .local-media-audio-ui {
    align-items: flex-start;
  }

  .local-media-audio-meta {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.25rem;
  }
}

a.local-media-timestamp {
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
`

export default function LocalMediaPlayer(userOptions = {}) {
  const options = { ...defaultOptions, ...userOptions }

  return {
    name: "LocalMediaPlayer",
    textTransform(_ctx, src) {
      return rewriteMediaExtendedAudioEmbeds(rewriteMediaTimestampLinks(src))
    },
    htmlPlugins() {
      return [
        () => {
          return (tree, file) => {
            replaceYoutubeAudioEmbeds(tree)

            const defaultMedia = resolveConfiguredMedia(
              sourceFilePath(file.data.filePath, file.data.frontmatter?.source, options.mediaRoot),
              file.data.frontmatter?.media,
              options,
            )

            visit(tree, "element", (node) => {
              if (
                node.tagName === "iframe" &&
                youtubeId(node.properties?.src)
              ) {
                node.properties ||= {}
                node.properties.src = withYoutubeApi(node.properties.src)
                node.properties.allow = "fullscreen; autoplay"
                node.properties.className = [
                  ...new Set(classNames(node).concat("local-media-youtube")),
                ]
              }

              if (
                (node.tagName === "video" || node.tagName === "audio") &&
                typeof node.properties?.src === "string"
              ) {
                node.properties.className = [
                  ...new Set(
                    classNames(node).concat(
                      node.tagName === "video" ? "local-media-video" : "local-media-audio",
                    ),
                  ),
                ]
              }

              if (isMarkedTimestamp(node)) {
                const seconds = timestampFrom(node)
                if (seconds === null) return
                const markedTarget = markedTimestampTarget(node)
                const markedMedia = markedTarget
                  ? resolveAliasedMedia(markedTarget, options.route, options.aliasManifest)
                  : null
                const mediaUrl = markedMedia?.url ?? markedTarget ?? defaultMedia?.url
                if (!mediaUrl) return
                markTimestampLink(node, `${mediaUrl}#t=${seconds}`, seconds)
                return
              }

              if (!defaultMedia) return

              const youtubeSeconds = youtubeTimestampFrom(node, defaultMedia)
              if (youtubeSeconds !== null) {
                markTimestampLink(node, `${defaultMedia.url}#t=${youtubeSeconds}`, youtubeSeconds)
                return
              }

              const localSeconds = localTimestampFrom(node, defaultMedia)
              if (localSeconds !== null) {
                markTimestampLink(node, `${defaultMedia.url}#t=${localSeconds}`, localSeconds)
              }
            })
          }
        },
      ]
    },
    async *emit(ctx, content) {
      const copied = new Set()

      let aliases = {}
      try {
        const manifest = JSON.parse(fs.readFileSync(path.resolve(options.aliasManifest), "utf8"))
        if (manifest?.aliases && typeof manifest.aliases === "object") aliases = manifest.aliases
      } catch {
        // A private alias manifest is optional for repositories without local media.
      }

      for (const [alias, source] of Object.entries(aliases)) {
        if (typeof source !== "string" || !fs.existsSync(source)) continue
        const dest = localMediaOutputPath(ctx.argv.output, options.route, alias)
        if (!dest || copied.has(dest)) continue

        await fs.promises.mkdir(path.dirname(dest), { recursive: true })
        if (options.copyMedia) {
          await fs.promises.copyFile(source, dest)
        } else {
          await fs.promises.rm(dest, { force: true })
          await fs.promises.symlink(source, dest)
        }
        copied.add(dest)
        yield dest
      }

      for (const [, file] of content) {
        const media = resolveConfiguredMedia(
          sourceFilePath(file.data.filePath, file.data.frontmatter?.source, options.mediaRoot),
          file.data.frontmatter?.media,
          options,
        )
        if (!media || media.type !== "local") continue

        const dest = localMediaOutputPath(ctx.argv.output, options.route, media.url)
        if (!dest || copied.has(dest)) continue

        await fs.promises.mkdir(path.dirname(dest), { recursive: true })
        if (options.copyMedia) {
          await fs.promises.copyFile(media.file, dest)
        } else {
          await fs.promises.rm(dest, { force: true })
          await fs.promises.symlink(media.file, dest)
        }
        copied.add(dest)
        yield dest
      }
    },
    externalResources() {
      return {
        js: [
          {
            script: playerScript,
            loadTime: "afterDOMReady",
            contentType: "inline",
          },
        ],
        css: [
          {
            content: playerStyle,
            inline: true,
          },
        ],
      }
    },
  }
}
