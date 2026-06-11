import fs from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { visit } from "unist-util-visit"

const markerOrigin = "https://local-media.invalid"
const defaultOptions = {
  mediaRoot: "/Users/moritzvitt/Notes/Obsidian Notes/Digital Garden/media-lib/Media",
  route: "/local-media",
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
  return left.replaceAll("\\", "/").toLocaleLowerCase() ===
    right.replaceAll("\\", "/").toLocaleLowerCase()
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

function encodePathSegment(segment) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
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

function youtubeSeconds(value) {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value)
    const raw = url.searchParams.get("t") || url.searchParams.get("start")
    if (!raw) return null
    const seconds = Number(raw.replace(/s$/i, ""))
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
  } catch {
    return null
  }
}

function youtubeEmbedUrl(id) {
  return `https://www.youtube.com/embed/${encodeURIComponent(id)}?enablejsapi=1`
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
    return {
      type: "youtube",
      target: mediaValue.trim(),
      url: `https://www.youtube.com/watch?v=${youtube}`,
      embedUrl: youtubeEmbedUrl(youtube),
      youtube,
    }
  }
  return resolveMediaFile(filePath, mediaValue, mediaRoot, route)
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

function markTimestampLink(node, href, seconds) {
  node.properties.href = href
  node.properties["data-media-time"] = String(seconds)
  node.properties["data-router-ignore"] = ""
  node.properties.className = [
    ...new Set(
      classNames(node)
        .filter((name) => name !== "external" && name !== "external-link")
        .concat("local-media-timestamp"),
    ),
  ]
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

function videoElement(media) {
  if (media.type === "youtube") {
    return {
      type: "element",
      tagName: "figure",
      properties: { className: ["local-media-player"] },
      children: [
        {
          type: "element",
          tagName: "iframe",
          properties: {
            className: ["local-media-youtube"],
            allow: "fullscreen; autoplay",
            frameBorder: "0",
            src: media.embedUrl,
          },
          children: [],
        },
        {
          type: "element",
          tagName: "figcaption",
          properties: {},
          children: [{ type: "text", value: "YouTube-Video" }],
        },
      ],
    }
  }

  return {
    type: "element",
    tagName: "figure",
    properties: { className: ["local-media-player"] },
    children: [
      {
        type: "element",
        tagName: "video",
        properties: {
          className: ["local-media-video"],
          controls: true,
          preload: "metadata",
          src: media.url,
        },
        children: [],
      },
      {
        type: "element",
        tagName: "figcaption",
        properties: {},
        children: [{ type: "text", value: "Lokale Videodatei" }],
      },
    ],
  }
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

function seekYoutubePlayer(seconds, mediaUrl, options = {}) {
  const frame = document.querySelector(".local-media-youtube")
  if (!(frame instanceof HTMLIFrameElement)) return false
  if (!sameYoutubeVideo(frame.src, mediaUrl)) return false
  frame.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }),
    "https://www.youtube.com",
  )
  if (options.play) {
    frame.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: "playVideo", args: [] }),
      "https://www.youtube.com",
    )
  }
  if (options.scroll) frame.scrollIntoView({ behavior: "smooth", block: "center" })
  return true
}

function seekLocalMediaPlayer(seconds, mediaUrl, options = {}) {
  const player = document.querySelector(".local-media-video")
  if (!(player instanceof HTMLVideoElement)) return false
  const playerUrl = normalizedMediaUrl(player.currentSrc || player.src)
  if (!playerUrl || playerUrl !== normalizedMediaUrl(mediaUrl)) return false

  const seek = () => {
    player.currentTime = seconds
    if (options.play) player.play().catch(() => {})
    if (options.scroll) player.scrollIntoView({ behavior: "smooth", block: "center" })
  }
  if (player.readyState >= 1) seek()
  else player.addEventListener("loadedmetadata", seek, { once: true })
  return true
}

function seekMediaPlayer(seconds, mediaUrl, options = {}) {
  return (
    seekLocalMediaPlayer(seconds, mediaUrl, options) ||
    seekYoutubePlayer(seconds, mediaUrl, options)
  )
}

function seekFromLocation() {
  const initial = Number(new URLSearchParams(location.hash.slice(1)).get("t"))
  if (!Number.isFinite(initial) || initial <= 0) return
  const player = document.querySelector(".local-media-video")
  if (player instanceof HTMLVideoElement) {
    seekMediaPlayer(initial, player.currentSrc || player.src, { scroll: true })
  }
  const frame = document.querySelector(".local-media-youtube")
  if (frame instanceof HTMLIFrameElement) seekMediaPlayer(initial, frame.src, { scroll: true })
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
  seekMediaPlayer(message.seconds, message.mediaUrl, { play: true })
})

document.addEventListener("click", (event) => {
  const target = event.target
  const link = target instanceof Element
    ? target.closest("a.local-media-timestamp")
    : null
  if (!(link instanceof HTMLAnchorElement)) return

  const seconds = Number(link.dataset.mediaTime)
  const mediaUrl = normalizedMediaUrl(link.href)
  if (!Number.isFinite(seconds) || !mediaUrl) return

  event.preventDefault()
  event.stopImmediatePropagation()
  localMediaChannel?.postMessage({ type: "seek", mediaUrl, seconds })
  seekMediaPlayer(seconds, mediaUrl, { play: true })
  history.replaceState(null, "", "#t=" + seconds)
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

document.addEventListener("nav", seekFromLocation)
document.addEventListener("render", seekFromLocation)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", seekFromLocation, { once: true })
} else {
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
      return rewriteMediaTimestampLinks(src)
    },
    htmlPlugins() {
      return [
        () => {
          return (tree, file) => {
            const media = resolveMedia(
              sourceFilePath(
                file.data.filePath,
                file.data.frontmatter?.source,
                options.mediaRoot,
              ),
              file.data.frontmatter?.media,
              options.mediaRoot,
              options.route,
            )
            if (!media) return

            let existingVideo = null
            let existingYoutube = null
            visit(tree, "element", (node) => {
              if (!existingVideo && node.tagName === "video") existingVideo = node
              if (
                !existingYoutube &&
                node.tagName === "iframe" &&
                media.type === "youtube" &&
                sameMediaTarget(youtubeId(node.properties?.src) || "", media.youtube)
              ) {
                existingYoutube = node
              }

              if (isMarkedTimestamp(node)) {
                const seconds = timestampFrom(node)
                if (seconds === null) return
                markTimestampLink(node, `${media.url}#t=${seconds}`, seconds)
                return
              }

              const youtubeSeconds = youtubeTimestampFrom(node, media)
              if (youtubeSeconds !== null) {
                markTimestampLink(node, `${media.url}#t=${youtubeSeconds}`, youtubeSeconds)
              }
            })

            if (media.type === "youtube" && existingYoutube) {
              existingYoutube.properties ||= {}
              existingYoutube.properties.src = withYoutubeApi(existingYoutube.properties.src)
              existingYoutube.properties.allow = "fullscreen; autoplay"
              existingYoutube.properties.className = [
                ...new Set(classNames(existingYoutube).concat("local-media-youtube")),
              ]
            } else if (existingVideo) {
              existingVideo.properties ||= {}
              existingVideo.properties.className = [
                ...new Set(classNames(existingVideo).concat("local-media-video")),
              ]
            } else {
              tree.children.unshift(videoElement(media))
            }
          }
        },
      ]
    },
    async *emit(ctx, content) {
      const copied = new Set()

      for (const [, file] of content) {
        const media = resolveMedia(
          sourceFilePath(
            file.data.filePath,
            file.data.frontmatter?.source,
            options.mediaRoot,
          ),
          file.data.frontmatter?.media,
          options.mediaRoot,
          options.route,
        )
        if (!media || media.type !== "local") continue

        const dest = localMediaOutputPath(ctx.argv.output, options.route, media.url)
        if (!dest || copied.has(dest)) continue

        await fs.promises.mkdir(path.dirname(dest), { recursive: true })
        await fs.promises.copyFile(media.file, dest)
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
