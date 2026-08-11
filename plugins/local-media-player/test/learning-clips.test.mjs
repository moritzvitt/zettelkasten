import test from "node:test"
import assert from "node:assert/strict"
import {
  buildLearningClips,
  clusterLearningClips,
  learningClipsFromSources,
  parseLearningList,
  parseSubtitleCues,
} from "../src/learning-clips.js"

test("parses SRT and WebVTT cue timings without publishing subtitle text", () => {
  const source = `WEBVTT

1
00:01:46,400 --> 00:01:48,100
これ仕上げちゃう

00:01:50.000 --> 00:01:52.250 position:50%
another line
`

  assert.deepEqual(parseSubtitleCues(source), [
    { start: 106.4, end: 108.1 },
    { start: 110, end: 112.25 },
  ])
})

test("reads timestamps only from Lernliste list items and prefers precise hash times", () => {
  const source = `# Note

- [0:10](https://example.test?t=10)

## Lernliste
- [0:35](https://youtube.com/watch?v=abc&t=35#t=00:00:35.84) phrase
- [[Film.mp4#t=106.4|1:46]] phrase
- no timestamp

## Danach
- [2:00](https://example.test?t=120)
`

  assert.deepEqual(parseLearningList(source), [
    { entry: 0, anchor: 35.84 },
    { entry: 1, anchor: 106.4 },
  ])
})

test("maps anchors to cues with tolerance and applies pre-roll and post-roll", () => {
  const entries = [
    { entry: 0, anchor: 106.4 },
    { entry: 1, anchor: 109.2 },
    { entry: 2, anchor: 200 },
  ]
  const cues = [
    { start: 106.4, end: 108.1 },
    { start: 110, end: 112 },
  ]

  assert.deepEqual(buildLearningClips(entries, cues), [
    { entry: 0, anchor: 106.4, cueStart: 106.4, cueEnd: 108.1, start: 104.4, end: 112.1 },
    { entry: 1, anchor: 109.2, cueStart: 110, cueEnd: 112, start: 108, end: 116 },
  ])
})

test("merges overlapping learning clips into navigable clusters", () => {
  const clips = [
    { entry: 0, anchor: 102, cueStart: 102, cueEnd: 103, start: 100, end: 107 },
    { entry: 1, anchor: 107, cueStart: 107, cueEnd: 108, start: 105, end: 112 },
    { entry: 2, anchor: 122, cueStart: 122, cueEnd: 123, start: 120, end: 127 },
  ]

  assert.deepEqual(clusterLearningClips(clips), [
    { start: 100, end: 112, clips: clips.slice(0, 2), entries: [0, 1] },
    { start: 120, end: 127, clips: clips.slice(2), entries: [2] },
  ])
})

test("builds publishable clip metadata without subtitle text", () => {
  const note = `## Lernliste
- [[Film.mp4#t=106.4|1:46]] word
`
  const subtitles = `1
00:01:46,400 --> 00:01:48,100
private subtitle text
`

  const clips = learningClipsFromSources(note, subtitles)
  assert.equal(JSON.stringify(clips).includes("private subtitle text"), false)
  assert.deepEqual(clips[0], {
    entry: 0,
    anchor: 106.4,
    cueStart: 106.4,
    cueEnd: 108.1,
    start: 104.4,
    end: 112.1,
  })
})
