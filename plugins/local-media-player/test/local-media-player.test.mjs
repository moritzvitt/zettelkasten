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

test("does not inject a player from frontmatter alone", () => {
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
    const plugin = LocalMediaPlayer({
      mediaRoot,
      aliasManifest: path.join(mediaRoot, "missing-alias-manifest.json"),
    })
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

    assert.deepEqual(tree.children, [])
  } finally {
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  }
})

test("marks direct media timestamp links and reuses the Markdown video player", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "local-media-markdown-player-"))
  const mediaPath = path.join(fixtureRoot, "Private Movie.mp4")
  const manifestPath = path.join(fixtureRoot, "local-media-aliases.json")
  const alias = "/local-media/0123456789abcdef01234567.mp4"
  fs.writeFileSync(mediaPath, "video")
  fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, aliases: { [alias]: mediaPath } }))

  try {
    const plugin = LocalMediaPlayer({ aliasManifest: manifestPath })
    const transformer = plugin.htmlPlugins()[0]()
    const video = {
      type: "element",
      tagName: "video",
      properties: { src: alias, controls: true },
      children: [],
    }
    const audio = {
      type: "element",
      tagName: "audio",
      properties: { src: alias, controls: true },
      children: [],
    }
    const timestamp = {
      type: "element",
      tagName: "a",
      properties: { href: `${alias}#t292` },
      children: [{ type: "text", value: "4:52" }],
    }
    const decimalTimestamp = {
      type: "element",
      tagName: "a",
      properties: { href: `${alias}?t=466.438` },
      children: [{ type: "text", value: "7:46" }],
    }
    const tree = { type: "root", children: [video, audio, timestamp, decimalTimestamp] }

    transformer(tree, {
      data: {
        filePath: path.join(fixtureRoot, "Published.md"),
        frontmatter: { media: alias },
      },
    })

    assert.equal(tree.children.length, 4)
    assert.deepEqual(video.properties.className, ["local-media-video"])
    assert.deepEqual(audio.properties.className, ["local-media-audio"])
    assert.equal(timestamp.properties.href, "#t=292")
    assert.equal(timestamp.properties["data-media-time"], "292")
    assert.equal(timestamp.properties["data-media-url"], alias)
    assert.equal(timestamp.properties["data-router-ignore"], "")
    assert.deepEqual(timestamp.properties.className, ["local-media-timestamp"])
    assert.equal(decimalTimestamp.properties.href, "#t=466.438")
    assert.equal(decimalTimestamp.properties["data-media-time"], "466.438")
    assert.equal(decimalTimestamp.properties["data-media-url"], alias)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("routes marked timestamps to their matching explicit player without frontmatter", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "local-media-multiple-players-"))
  const videoAlias = "/local-media/0123456789abcdef01234567.mp4"
  const audioAlias = "/local-media/89abcdef0123456701234567.mp3"
  const videoPath = path.join(fixtureRoot, "Private Video.mp4")
  const audioPath = path.join(fixtureRoot, "Private Audio.mp3")
  const manifestPath = path.join(fixtureRoot, "local-media-aliases.json")
  fs.writeFileSync(videoPath, "video")
  fs.writeFileSync(audioPath, "audio")
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ aliases: { [videoAlias]: videoPath, [audioAlias]: audioPath } }),
  )

  try {
    const plugin = LocalMediaPlayer({ aliasManifest: manifestPath })
    const transformer = plugin.htmlPlugins()[0]()
    const video = {
      type: "element",
      tagName: "video",
      properties: { src: videoAlias },
      children: [],
    }
    const audio = {
      type: "element",
      tagName: "audio",
      properties: { src: audioAlias },
      children: [],
    }
    const timestamp = {
      type: "element",
      tagName: "a",
      properties: {
        href: `https://local-media.invalid/${encodeURIComponent(audioAlias)}?t=75.5`,
      },
      children: [{ type: "text", value: "1:15" }],
    }
    const tree = { type: "root", children: [video, audio, timestamp] }

    transformer(tree, {
      data: { filePath: path.join(fixtureRoot, "Published.md"), frontmatter: {} },
    })

    assert.deepEqual(video.properties.className, ["local-media-video"])
    assert.deepEqual(audio.properties.className, ["local-media-audio"])
    assert.equal(timestamp.properties.href, "#t=75.5")
    assert.equal(timestamp.properties["data-media-time"], "75.5")
    assert.equal(timestamp.properties["data-media-url"], audioAlias)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
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

test("attaches publishable learning clips to the matching player and learning-list links", () => {
  const plugin = LocalMediaPlayer()
  const transformer = plugin.htmlPlugins()[0]()
  const clips = [{ entry: 0, anchor: 35.84, cueStart: 35.84, cueEnd: 37, start: 33.84, end: 41 }]
  const frame = {
    type: "element",
    tagName: "iframe",
    properties: { src: "https://www.youtube.com/embed/example" },
    children: [],
  }
  const timestamp = {
    type: "element",
    tagName: "a",
    properties: { href: "https://www.youtube.com/watch?v=example&t=35" },
    children: [{ type: "text", value: "0:35" }],
  }
  const tree = { type: "root", children: [frame, timestamp] }

  transformer(tree, {
    data: {
      filePath: "/tmp/published.md",
      frontmatter: {
        media: "https://www.youtube.com/watch?v=example",
        learningClips: clips,
      },
    },
  })

  assert.equal(frame.properties["data-learning-clips"], JSON.stringify(clips))
  assert.equal(
    frame.properties["data-learning-media-url"],
    "https://www.youtube.com/watch?v=example",
  )
  assert.ok(frame.properties.className.includes("local-media-learning-target"))
  assert.equal(timestamp.properties["data-learning-entry"], "0")
})

test("attaches learning clips to a YouTube audio card rather than its hidden iframe", () => {
  const plugin = LocalMediaPlayer()
  const transformer = plugin.htmlPlugins()[0]()
  const clip = { entry: 0, anchor: 6, cueStart: 6, cueEnd: 7, start: 4, end: 11 }
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "span",
        properties: {
          "data-local-media-audio": "https://www.youtube.com/watch?v=example#as=audio",
          "data-local-media-title": "",
        },
        children: [],
      },
    ],
  }

  transformer(tree, {
    data: {
      filePath: "/tmp/published.md",
      frontmatter: {
        media: "https://www.youtube.com/watch?v=example",
        learningClips: [clip],
      },
    },
  })

  const card = tree.children[0]
  const frame = card.children[0]
  assert.equal(card.properties["data-learning-clips"], JSON.stringify([clip]))
  assert.equal(frame.properties["data-learning-clips"], undefined)
})

test("keeps the learning bar below the media player without overlap", () => {
  const resources = LocalMediaPlayer().externalResources()
  const css = resources.css.map((resource) => resource.content).join("\n")

  assert.match(css, /\.local-media-learning-controls\s*\{[\s\S]*?margin:\s*0 0 1\.5rem;/)
  assert.doesNotMatch(css, /\.local-media-learning-controls\s*\{[\s\S]*?margin:\s*-/)
})

test("adds audio-only and playback controls for every visual media player", () => {
  const resources = LocalMediaPlayer().externalResources()
  const script = resources.js.map((resource) => resource.script).join("\n")

  assert.match(script, /data-learning-action="audio-only"/)
  assert.match(script, /data-learning-action="play-pause"/)
  assert.match(script, /local-media-audio-only/)
  assert.match(script, /function hydrateMediaModeControls\(\)/)
  assert.match(script, /target\.hasAttribute\("data-learning-clips"\)/)
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

test("links local media from its original location by default", async () => {
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
    const plugin = LocalMediaPlayer({
      mediaRoot,
      aliasManifest: path.join(mediaRoot, "missing-alias-manifest.json"),
    })
    const emitted = []
    for await (const file of plugin.emit({ argv: { output } }, [
      [
        "sample",
        {
          data: {
            filePath: notePath,
            frontmatter: { media: `[[${mediaName}]]` },
          },
        },
      ],
    ])) {
      emitted.push(file)
    }

    const linkedPath = path.join(output, "local-media", "Japanese", mediaName)
    assert.deepEqual(emitted, [linkedPath])
    assert.equal(fs.lstatSync(linkedPath).isSymbolicLink(), true)
    assert.equal(fs.realpathSync(linkedPath), fs.realpathSync(mediaPath))
  } finally {
    fs.rmSync(mediaRoot, { recursive: true, force: true })
    fs.rmSync(output, { recursive: true, force: true })
  }
})

test("resolves opaque media aliases from the private manifest", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "local-media-alias-"))
  const output = path.join(fixtureRoot, "public")
  const privateRoot = path.join(fixtureRoot, "private")
  const mediaPath = path.join(fixtureRoot, "Secret Movie Title.mp4")
  const alias = "/local-media/0123456789abcdef01234567.mp4"
  const manifestPath = path.join(privateRoot, "local-media-aliases.json")
  fs.mkdirSync(privateRoot, { recursive: true })
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(mediaPath, "video")
  fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, aliases: { [alias]: mediaPath } }))

  try {
    const plugin = LocalMediaPlayer({ aliasManifest: manifestPath })
    const file = {
      data: {
        filePath: path.join(fixtureRoot, "Published.md"),
        frontmatter: { media: alias },
      },
    }
    const transformer = plugin.htmlPlugins()[0]()
    const video = {
      type: "element",
      tagName: "video",
      properties: { src: alias },
      children: [],
    }
    const tree = { type: "root", children: [video] }
    transformer(tree, file)
    assert.equal(tree.children.length, 1)
    assert.deepEqual(video.properties.className, ["local-media-video"])

    const emitted = []
    for await (const emittedPath of plugin.emit({ argv: { output } }, [["published", file]])) {
      emitted.push(emittedPath)
    }

    const linkedPath = path.join(output, "local-media", "0123456789abcdef01234567.mp4")
    assert.deepEqual(emitted, [linkedPath])
    assert.equal(fs.realpathSync(linkedPath), fs.realpathSync(mediaPath))
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
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
    const plugin = LocalMediaPlayer({
      mediaRoot,
      copyMedia: true,
      aliasManifest: path.join(mediaRoot, "missing-alias-manifest.json"),
    })
    const emitted = []
    for await (const file of plugin.emit({ argv: { output } }, [
      [
        "sample",
        {
          data: {
            filePath: notePath,
            frontmatter: { media: `[[${mediaName}]]` },
          },
        },
      ],
    ])) {
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
