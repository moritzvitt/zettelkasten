function timestampSeconds(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(",", ".")
  if (!normalized) return null

  const parts = normalized.split(":").map(Number)
  if (parts.some((part) => !Number.isFinite(part)) || parts.length > 3) return null
  if (parts.length === 1) return parts[0] >= 0 ? parts[0] : null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

function cueTimestampSeconds(value) {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/)
  if (!match) return null
  const milliseconds = Number(match[4].padEnd(3, "0"))
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + milliseconds / 1000
}

export function parseSubtitleCues(source) {
  const normalized = String(source ?? "")
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
  const timeLine =
    /^(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s+-->\s+(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})(?:\s+.*)?$/
  const cues = []

  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.split("\n").map((line) => line.trim())
    const timing = lines.find((line) => timeLine.test(line))
    if (!timing) continue
    const match = timing.match(timeLine)
    const start = cueTimestampSeconds(match?.[1])
    const end = cueTimestampSeconds(match?.[2])
    if (start === null || end === null || end <= start) continue
    cues.push({ start, end })
  }

  return cues.sort((left, right) => left.start - right.start || left.end - right.end)
}

function learningListBody(source) {
  const lines = String(source ?? "")
    .replaceAll("\r\n", "\n")
    .split("\n")
  const heading = lines.findIndex((line) => /^#{1,6}\s+Lernliste\s*$/i.test(line.trim()))
  if (heading === -1) return []
  const level = lines[heading].match(/^#+/)?.[0].length ?? 2
  const body = []
  for (const line of lines.slice(heading + 1)) {
    const nextHeading = line.match(/^(#{1,6})\s+/)
    if (nextHeading && nextHeading[1].length <= level) break
    body.push(line)
  }
  return body
}

function timestampFromLearningLine(line) {
  const anchors = [...line.matchAll(/#t=([^\s)\]&|]+)/gi)]
  if (anchors.length) {
    const seconds = timestampSeconds(decodeURIComponent(anchors.at(-1)[1]))
    if (seconds !== null) return seconds
  }

  const queries = [...line.matchAll(/[?&](?:t|start)=([^\s)&#]+)/gi)]
  if (queries.length) {
    const seconds = timestampSeconds(decodeURIComponent(queries.at(-1)[1]).replace(/s$/i, ""))
    if (seconds !== null) return seconds
  }

  const label = line.match(/(?:\[|\|)(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]?/)
  return label ? timestampSeconds(label[1]) : null
}

export function parseLearningList(source) {
  const entries = []
  for (const line of learningListBody(source)) {
    if (!/^\s*[-*+]\s+/.test(line)) continue
    const anchor = timestampFromLearningLine(line)
    if (anchor === null) continue
    entries.push({ entry: entries.length, anchor })
  }
  return entries
}

function cueDistance(anchor, cue) {
  if (anchor < cue.start) return cue.start - anchor
  if (anchor > cue.end) return anchor - cue.end
  return 0
}

function matchingCue(anchor, cues, maxCueGap) {
  let best = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const cue of cues) {
    if (cue.start > anchor + maxCueGap) break
    const distance = cueDistance(anchor, cue)
    if (distance < bestDistance) {
      best = cue
      bestDistance = distance
    }
  }
  return bestDistance <= maxCueGap ? best : null
}

function rounded(value) {
  return Math.round(value * 1000) / 1000
}

export function buildLearningClips(entries, cues, options = {}) {
  const preRoll = Number.isFinite(options.preRoll) ? Math.max(0, options.preRoll) : 2
  const postRoll = Number.isFinite(options.postRoll) ? Math.max(0, options.postRoll) : 4
  const maxCueGap = Number.isFinite(options.maxCueGap) ? Math.max(0, options.maxCueGap) : 2

  return entries.flatMap(({ entry, anchor }) => {
    const cue = matchingCue(anchor, cues, maxCueGap)
    if (!cue) return []
    return [
      {
        entry,
        anchor: rounded(anchor),
        cueStart: rounded(cue.start),
        cueEnd: rounded(cue.end),
        start: rounded(Math.max(0, cue.start - preRoll)),
        end: rounded(cue.end + postRoll),
      },
    ]
  })
}

export function clusterLearningClips(clips) {
  const sorted = [...clips].sort((left, right) => left.start - right.start || left.end - right.end)
  const clusters = []
  for (const clip of sorted) {
    const current = clusters.at(-1)
    if (!current || clip.start > current.end) {
      clusters.push({
        start: clip.start,
        end: clip.end,
        clips: [clip],
        entries: [clip.entry],
      })
      continue
    }
    current.end = Math.max(current.end, clip.end)
    current.clips.push(clip)
    if (!current.entries.includes(clip.entry)) current.entries.push(clip.entry)
  }
  return clusters
}

export function learningClipsFromSources(noteSource, subtitleSource, options = {}) {
  return buildLearningClips(
    parseLearningList(noteSource),
    parseSubtitleCues(subtitleSource),
    options,
  )
}
