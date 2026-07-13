import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import LocalMediaPlayer, {
  rewriteMediaExtendedAudioEmbeds,
  rewriteMediaTimestampLinks,
} from "../src/index.js"

test("rewrites media timestamps when filenames contain square brackets", () => {
  const source = `---
media: "[[Ocean Waves (1993) [1080p].mp4]]"
---
- [[Ocean Waves (1993) [1080p].mp4#t=189.204|3:09]] phrase
`

  const result = rewriteMediaTimestampLinks(source)

  assert.match(
    result,
    /\[3:09\]\(https:\/\/local-media\.invalid\/Ocean%20Waves%20\(1993\)%20%5B1080p%5D\.mp4\?t=189\.204\)/,
  )
})

test("injects a player for a bracketed Howl media filename", () => {
  const mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "local-media-player-"))
  const noteDir = path.join(
    mediaRoot,
    "Japanese",
    "movies",
    "Howl's Moving Castle (2004) [BluRay] [1080p] [YTS.AM]",
  )
  const mediaName = "Howl's Moving Castle (2004) [BluRay] [1080p].mp4"
  fs.mkdirSync(noteDir, { recursive: true })
  const notePath = path.join(noteDir, "Howl's Moving Castle.md")
  fs.writeFileSync(notePath, "")
  fs.writeFileSync(path.join(noteDir, mediaName), "")

  try {
    const plugin = LocalMediaPlayer({ mediaRoot })
    const transformer = plugin.htmlPlugins()[0]()
    const tree = {
      type: "root",
      children: [],
    }

    transformer(tree, {
      data: {
        filePath: notePath,
        frontmatter: { media: `[[${mediaName}]]` },
      },
    })

    assert.equal(tree.children[0]?.tagName, "figure")
    assert.match(
      tree.children[0]?.children[0]?.properties?.src ?? "",
      /Howl%27s%20Moving%20Castle%20%282004%29%20%5BBluRay%5D%20%5B1080p%5D\.mp4$/,
    )
  } finally {
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
})

test("renders Media Extended YouTube audio embeds as compact audio cards", () => {
  const plugin = LocalMediaPlayer()
  const transformer = plugin.htmlPlugins()[0]()
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "img",
            properties: {
              src: "https://www.youtube.com/watch?v=CxI1B6NXrc4#as=audio",
              alt: "Being a Porn Director in Japan",
            },
            children: [],
          },
        ],
      },
    ],
  }

  transformer(tree, {
    data: {
      filePath: "/tmp/note.md",
      frontmatter: {},
    },
  })

  const figure = tree.children[0].children[0]
  assert.equal(figure.tagName, "figure")
  assert.deepEqual(figure.properties.className, ["local-media-player", "local-media-audio-card"])
  assert.equal(figure.properties["data-media-url"], "https://www.youtube.com/watch?v=CxI1B6NXrc4")
  assert.match(figure.children[0].properties.src, /youtube\.com\/embed\/CxI1B6NXrc4/)
  assert.equal(figure.children[1].properties.className[0], "local-media-audio-ui")
  const main = figure.children[1].children[1]
  assert.equal(main.children[1].tagName, "input")
  assert.deepEqual(main.children[1].properties.className, ["local-media-audio-progress"])
})

test("rewrites Media Extended audio markdown before Obsidian YouTube embeds run", () => {
  const source = `![100x150](https://www.youtube.com/watch?v=xdLG7jXGkLQ&list=RDxdLG7jXGkLQ&start_radio=1#controls&as=audio)`

  const result = rewriteMediaExtendedAudioEmbeds(source)

  assert.match(result, /https:\/\/local-media\.invalid\/youtube-audio/)
  assert.match(result, /src=https%3A%2F%2Fwww\.youtube\.com%2Fwatch/)
  assert.match(result, /xdLG7jXGkLQ/)
  assert.doesNotMatch(result, /youtube\.com\/embed/)
  assert.match(result, /^!\[YouTube audio\]/)
})

test("renders Media Extended audio placeholders as compact audio cards", () => {
  const plugin = LocalMediaPlayer()
  const transformer = plugin.htmlPlugins()[0]()
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "span",
        properties: {
          "data-local-media-audio":
            "https://www.youtube.com/watch?v=xdLG7jXGkLQ&list=RDxdLG7jXGkLQ&start_radio=1#controls&as=audio",
          "data-local-media-title": "",
        },
        children: [],
      },
    ],
  }

  transformer(tree, {
    data: {
      filePath: "/tmp/note.md",
      frontmatter: {},
    },
  })

  const figure = tree.children[0]
  assert.equal(figure.tagName, "figure")
  assert.deepEqual(figure.properties.className, ["local-media-player", "local-media-audio-card"])
  assert.match(figure.children[0].properties.src, /youtube\.com\/embed\/xdLG7jXGkLQ/)
})

test("renders Media Extended audio marker images as compact audio cards", () => {
  const plugin = LocalMediaPlayer()
  const transformer = plugin.htmlPlugins()[0]()
  const source =
    "https://www.youtube.com/watch?v=Y7G5ithbFys&list=RDY7G5ithbFys&start_radio=1&t=1508s#as=audio"
  const marker = new URL("https://local-media.invalid/youtube-audio")
  marker.searchParams.set("src", source)
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "img",
        properties: {
          src: marker.href,
          alt: "YouTube audio",
        },
        children: [],
      },
    ],
  }

  transformer(tree, {
    data: {
      filePath: "/tmp/note.md",
      frontmatter: {},
    },
  })

  const figure = tree.children[0]
  assert.equal(figure.tagName, "figure")
  assert.deepEqual(figure.properties.className, ["local-media-player", "local-media-audio-card"])
  assert.equal(figure.properties["data-media-time"], "1508")
  assert.match(figure.children[0].properties.src, /youtube\.com\/embed\/Y7G5ithbFys/)
  const progress = figure.children[1].children[1].children[1]
  assert.equal(progress.tagName, "input")
  assert.equal(progress.properties.value, "1508")
  assert.equal(progress.properties.min, "0")
  assert.equal(progress.properties.step, "1")
  assert.ok(Number(progress.properties.max) > 1508)
})

test("does not copy local media by default", async () => {
  const mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "local-media-player-"))
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "local-media-output-"))
  const noteDir = path.join(mediaRoot, "Japanese")
  const mediaName = "sample.mp4"
  fs.mkdirSync(noteDir, { recursive: true })
  const notePath = path.join(noteDir, "Sample.md")
  const mediaPath = path.join(noteDir, mediaName)
  fs.writeFileSync(notePath, "")
  fs.writeFileSync(mediaPath, "video")

  try {
    const plugin = LocalMediaPlayer({ mediaRoot })
    const emitted = []
    for await (const file of plugin.emit(
      { argv: { output } },
      [
        [
          "sample",
          {
            data: {
              filePath: notePath,
              frontmatter: { media: `[[${mediaName}]]` },
            },
          },
        ],
      ],
    )) {
      emitted.push(file)
    }

    assert.deepEqual(emitted, [])
    assert.equal(fs.existsSync(path.join(output, "local-media", "Japanese", mediaName)), false)
  } finally {
    fs.rmSync(mediaRoot, { recursive: true, force: true })
    fs.rmSync(output, { recursive: true, force: true })
  }
})

test("copies local media when explicitly enabled", async () => {
  const mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "local-media-player-"))
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "local-media-output-"))
  const noteDir = path.join(mediaRoot, "Japanese")
  const mediaName = "sample.mp4"
  fs.mkdirSync(noteDir, { recursive: true })
  const notePath = path.join(noteDir, "Sample.md")
  const mediaPath = path.join(noteDir, mediaName)
  fs.writeFileSync(notePath, "")
  fs.writeFileSync(mediaPath, "video")

  try {
    const plugin = LocalMediaPlayer({ mediaRoot, copyMedia: true })
    const emitted = []
    for await (const file of plugin.emit(
      { argv: { output } },
      [
        [
          "sample",
          {
            data: {
              filePath: notePath,
              frontmatter: { media: `[[${mediaName}]]` },
            },
          },
        ],
      ],
    )) {
      emitted.push(file)
    }

    const copiedPath = path.join(output, "local-media", "Japanese", mediaName)
    assert.deepEqual(emitted, [copiedPath])
    assert.equal(fs.readFileSync(copiedPath, "utf8"), "video")
  } finally {
    fs.rmSync(mediaRoot, { recursive: true, force: true })
    fs.rmSync(output, { recursive: true, force: true })
  }
})
