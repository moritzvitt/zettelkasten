import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const syncScript = path.join(scriptsDir, "sync-zettel.mjs")

test("rewrites explicit Obsidian folder links to the generated index slug", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-folder-link-"))
  const gardenRoot = path.join(fixtureRoot, "Digital Garden")
  const teaGarden = path.join(gardenRoot, "Tea Garden")
  const music = path.join(teaGarden, "music")
  const outputRoot = path.join(fixtureRoot, "site")

  fs.mkdirSync(music, { recursive: true })
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(
    path.join(teaGarden, "Welcome in my Digital Garden!.md"),
    `---\npublish: true\n---\n[[Digital Garden/Tea Garden/music/|music]]\n`,
  )
  fs.writeFileSync(
    path.join(music, "Song.md"),
    `---\npublish: true\ntags:\n  - music\n  - favourite\n---\n# Song\n`,
  )

  try {
    execFileSync(process.execPath, [syncScript], {
      cwd: outputRoot,
      env: { ...process.env, ZETTEL_SOURCE_ROOT: gardenRoot },
      stdio: "pipe",
    })

    const homepage = fs.readFileSync(path.join(outputRoot, "content", "index.md"), "utf8")
    assert.match(homepage, /\[\[tea-garden\/music\/index\|music\]\]/)
    assert.doesNotMatch(homepage, /Digital Garden\/Tea Garden\/music/)

    const musicIndex = fs.readFileSync(
      path.join(outputRoot, "content", "Tea Garden", "music", "index.md"),
      "utf8",
    )
    assert.match(musicIndex, /\[\[tea-garden\/music\/song\|Song\]\]/)
    assert.doesNotMatch(musicIndex, /\[\[Song\]\]/)

    const song = fs.readFileSync(
      path.join(outputRoot, "content", "Tea Garden", "music", "Song.md"),
      "utf8",
    )
    assert.match(song, /tags:\n  - zettel\n  - music\n  - favourite/)

    const brainIndex = JSON.parse(
      fs.readFileSync(path.join(outputRoot, "quartz", "static", "brain-index.json"), "utf8"),
    )
    assert.deepEqual(brainIndex.nodes["tea-garden/music/song"].tags, [
      "zettel",
      "music",
      "favourite",
    ])
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("copies every Obsidian base while preserving its relative path and contents", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-bases-"))
  const gardenRoot = path.join(fixtureRoot, "Digital Garden")
  const nestedRoot = path.join(gardenRoot, "media-lib", "Japanese")
  const outputRoot = path.join(fixtureRoot, "site")
  const rootBase = "views:\n  - type: table\n"
  const nestedBase = 'filters:\n  and:\n    - file.hasTag("japanese")\n'

  fs.mkdirSync(nestedRoot, { recursive: true })
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(path.join(gardenRoot, "index.base"), rootBase)
  fs.writeFileSync(path.join(nestedRoot, "videos.base"), nestedBase)

  try {
    execFileSync(process.execPath, [syncScript], {
      cwd: outputRoot,
      env: { ...process.env, ZETTEL_SOURCE_ROOT: gardenRoot },
      stdio: "pipe",
    })

    assert.equal(fs.readFileSync(path.join(outputRoot, "content", "index.base"), "utf8"), rootBase)
    assert.equal(
      fs.readFileSync(
        path.join(outputRoot, "content", "media-lib", "Japanese", "videos.base"),
        "utf8",
      ),
      nestedBase,
    )
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("keeps links and view embeds for copied Obsidian bases public", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-base-links-"))
  const gardenRoot = path.join(fixtureRoot, "Digital Garden")
  const outputRoot = path.join(fixtureRoot, "site")

  fs.mkdirSync(gardenRoot, { recursive: true })
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(
    path.join(gardenRoot, "Home.md"),
    [
      "---",
      "publish: true",
      "---",
      "[[japanese-media.base]]",
      "![[japanese-media.base#Cards|Japanese Media]]",
      "",
    ].join("\n"),
  )
  fs.writeFileSync(
    path.join(gardenRoot, "japanese-media.base"),
    "views:\n  - type: cards\n    name: Cards\n",
  )

  try {
    execFileSync(process.execPath, [syncScript], {
      cwd: outputRoot,
      env: { ...process.env, ZETTEL_SOURCE_ROOT: gardenRoot },
      stdio: "pipe",
    })

    const published = fs.readFileSync(path.join(outputRoot, "content", "Home.md"), "utf8")
    assert.match(published, /\[\[japanese-media\.base\|japanese-media\.base\]\]/)
    assert.match(published, /!\[\[japanese-media\.base#Cards\|Japanese Media\]\]/)
    assert.doesNotMatch(published, /nicht öffentlich verfügbar/)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("publishes quote-containing filenames at stable linkable paths", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-quoted-path-"))
  const gardenRoot = path.join(fixtureRoot, "Digital Garden")
  const outputRoot = path.join(fixtureRoot, "site")

  fs.mkdirSync(gardenRoot, { recursive: true })
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(
    path.join(gardenRoot, 'A "Quoted" Note.md'),
    '---\npublish: true\n---\n# A "Quoted" Note\n',
  )

  try {
    execFileSync(process.execPath, [syncScript], {
      cwd: outputRoot,
      env: { ...process.env, ZETTEL_SOURCE_ROOT: gardenRoot },
      stdio: "pipe",
    })
    assert.equal(fs.existsSync(path.join(outputRoot, "content", "A Quoted Note.md")), true)
    assert.equal(fs.existsSync(path.join(outputRoot, 'content', 'A "Quoted" Note.md')), false)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("does not publish the internal Excalidraw tag as a dangling tag route", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-excalidraw-tag-"))
  const gardenRoot = path.join(fixtureRoot, "Digital Garden")
  const outputRoot = path.join(fixtureRoot, "site")

  fs.mkdirSync(gardenRoot, { recursive: true })
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(
    path.join(gardenRoot, "Drawing.excalidraw.md"),
    "---\npublish: true\nexcalidraw-plugin: parsed\ntags:\n  - excalidraw\n---\n# Drawing\n",
  )

  try {
    execFileSync(process.execPath, [syncScript], {
      cwd: outputRoot,
      env: { ...process.env, ZETTEL_SOURCE_ROOT: gardenRoot },
      stdio: "pipe",
    })
    const published = fs.readFileSync(
      path.join(outputRoot, "content", "Drawing.excalidraw.md"),
      "utf8",
    )
    assert.doesNotMatch(published, /^\s*-\s*excalidraw\s*$/m)
    assert.match(published, /^excalidraw-plugin: parsed$/m)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("renders unresolved or private local links without broken public targets", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-unresolved-links-"))
  const gardenRoot = path.join(fixtureRoot, "Digital Garden")
  const outputRoot = path.join(fixtureRoot, "site")

  fs.mkdirSync(gardenRoot, { recursive: true })
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(
    path.join(gardenRoot, "Public.md"),
    [
      "---",
      "publish: true",
      "next:",
      '  - "[[Private Note]]"',
      "---",
      "[[Private Note|private destination]]",
      "![[missing.pdf]]",
      "[source file](/Users/example/private/source.js:12)",
      "[missing attachment](missing-attachment.pdf)",
      "",
    ].join("\n"),
  )
  fs.writeFileSync(path.join(gardenRoot, "Private Note.md"), "---\npublish: false\n---\nPrivate\n")

  try {
    execFileSync(process.execPath, [syncScript], {
      cwd: outputRoot,
      env: { ...process.env, ZETTEL_SOURCE_ROOT: gardenRoot },
      stdio: "pipe",
    })

    const published = fs.readFileSync(path.join(outputRoot, "content", "Public.md"), "utf8")
    assert.match(published, /private destination/)
    assert.match(published, /missing\.pdf – nicht öffentlich verfügbar/)
    assert.match(published, /source file/)
    assert.match(published, /missing attachment/)
    assert.doesNotMatch(published, /\[\[Private Note/)
    assert.doesNotMatch(published, /^next:/m)
    assert.doesNotMatch(published, /\/Users\/example/)
    assert.doesNotMatch(published, /\]\(missing-attachment\.pdf\)/)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("publishes frontmatter properties referenced by Base sorting and grouping", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-base-properties-"))
  const gardenRoot = path.join(fixtureRoot, "Digital Garden")
  const outputRoot = path.join(fixtureRoot, "site")

  fs.mkdirSync(gardenRoot, { recursive: true })
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(
    path.join(gardenRoot, "media.base"),
    [
      "views:",
      "  - type: cards",
      "    name: grouped media",
      "    groupBy:",
      "      property: creator",
      "      direction: ASC",
      "    sort:",
      "      - property: creator",
      "        direction: ASC",
      "      - property: title",
      "        direction: ASC",
      "    image: note.cover",
      "    filters:",
      "      and:",
      "        - stars > 5",
      '        - creator_url.contains("youtube")',
      "formulas:",
      '  subtitle: \'[album, creator].filter(value.isTruthy()).join(" - ")\'',
      "",
    ].join("\n"),
  )
  fs.writeFileSync(
    path.join(gardenRoot, "Video.md"),
    [
      "---",
      "publish: true",
      "creator: Example Creator",
      "cover: https://example.com/cover.jpg",
      "stars: 6",
      "creator_url: https://youtube.com/example",
      "album: Example Album",
      "tags:",
      "  - japanese/relationships",
      "private-note: do not publish",
      "---",
      "# Video",
      "",
    ].join("\n"),
  )

  try {
    execFileSync(process.execPath, [syncScript], {
      cwd: outputRoot,
      env: { ...process.env, ZETTEL_SOURCE_ROOT: gardenRoot },
      stdio: "pipe",
    })

    const published = fs.readFileSync(path.join(outputRoot, "content", "Video.md"), "utf8")
    assert.match(published, /^creator: Example Creator$/m)
    assert.match(published, /^cover: https:\/\/example\.com\/cover\.jpg$/m)
    assert.match(published, /^stars: 6$/m)
    assert.match(published, /^creator_url: https:\/\/youtube\.com\/example$/m)
    assert.match(published, /^album: Example Album$/m)
    assert.match(published, /tags:\n  - zettel\n  - japanese\n  - japanese\/relationships/)
    assert.doesNotMatch(published, /^private-note:/m)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("publishes derived learning clip timings without caption paths or subtitle text", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-learning-clips-"))
  const gardenRoot = path.join(fixtureRoot, "Digital Garden")
  const outputRoot = path.join(fixtureRoot, "site")
  const captionPath = path.join(fixtureRoot, "private.ja.srt")
  const notePath = path.join(gardenRoot, "Learning Movie.md")

  fs.mkdirSync(gardenRoot, { recursive: true })
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(captionPath, "1\n00:01:46,400 --> 00:01:48,100\nprivate subtitle text\n")
  fs.writeFileSync(
    notePath,
    `---\npublish: true\nmedia: https://www.youtube.com/watch?v=example\nlanguage: ja\ncaptions:\n  - "${new URL(`file://${captionPath}`).href}#lang=ja&label=Japanese"\n---\n## Lernliste\n- [1:46](https://www.youtube.com/watch?v=example&t=106.4) word\n`,
  )

  try {
    execFileSync(process.execPath, [syncScript], {
      cwd: outputRoot,
      env: { ...process.env, ZETTEL_SOURCE_ROOT: gardenRoot },
      stdio: "pipe",
    })

    const published = fs.readFileSync(path.join(outputRoot, "content", "Learning Movie.md"), "utf8")
    assert.match(published, /learningClips:/)
    assert.match(published, /cueStart: 106\.4/)
    assert.match(published, /start: 104\.4/)
    assert.doesNotMatch(published, /private subtitle text/)
    assert.doesNotMatch(published, /private\.ja\.srt/)
    assert.doesNotMatch(published, /captions:/)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("copies frontmatter cover assets and rewrites their wikilinks to published paths", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-cover-asset-"))
  const gardenRoot = path.join(fixtureRoot, "Digital Garden")
  const movieRoot = path.join(gardenRoot, "media-lib", "Movies", "Example Movie")
  const attachmentsRoot = path.join(movieRoot, "attachments")
  const outputRoot = path.join(fixtureRoot, "site")
  const coverName = "mx-img-example-cover.jpg"
  const coverContents = Buffer.from("example-cover")

  fs.mkdirSync(attachmentsRoot, { recursive: true })
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(
    path.join(movieRoot, "Example Movie.md"),
    `---\npublish: true\ncover: "[[${coverName}]]"\n---\n# Example Movie\n`,
  )
  fs.writeFileSync(path.join(attachmentsRoot, coverName), coverContents)

  try {
    execFileSync(process.execPath, [syncScript], {
      cwd: outputRoot,
      env: { ...process.env, ZETTEL_SOURCE_ROOT: gardenRoot },
      stdio: "pipe",
    })

    const publishedNote = fs.readFileSync(
      path.join(outputRoot, "content", "media-lib", "Movies", "Example Movie", "Example Movie.md"),
      "utf8",
    )
    assert.ok(
      publishedNote.includes(
        'cover: "[[media-lib/Movies/Example Movie/mx-img-example-cover.jpg]]"',
      ),
    )
    assert.deepEqual(
      fs.readFileSync(
        path.join(outputRoot, "content", "media-lib", "Movies", "Example Movie", coverName),
      ),
      coverContents,
    )
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("publishes referenced external pictures without leaking their local file URLs", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-external-pictures-"))
  const gardenRoot = path.join(fixtureRoot, "Digital Garden")
  const picturesRoot = path.join(fixtureRoot, "Pictures")
  const noteRoot = path.join(gardenRoot, "Gallery")
  const outputRoot = path.join(fixtureRoot, "site")
  const coverName = "Cover Photo.jpg"
  const drawingName = "My Drawing.png"

  fs.mkdirSync(noteRoot, { recursive: true })
  fs.mkdirSync(picturesRoot, { recursive: true })
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(path.join(picturesRoot, coverName), "cover")
  fs.writeFileSync(path.join(picturesRoot, drawingName), "drawing")
  fs.writeFileSync(
    path.join(noteRoot, "Pictures.md"),
    [
      "---",
      "publish: true",
      `cover: ${new URL(`file://${path.join(picturesRoot, coverName)}`).href}`,
      "---",
      `![My drawing](${new URL(`file://${path.join(picturesRoot, drawingName)}`).href})`,
      "",
    ].join("\n"),
  )

  try {
    execFileSync(process.execPath, [syncScript], {
      cwd: outputRoot,
      env: {
        ...process.env,
        ZETTEL_SOURCE_ROOT: gardenRoot,
        ZETTEL_PICTURES_ROOT: picturesRoot,
      },
      stdio: "pipe",
    })

    const publishedNote = fs.readFileSync(
      path.join(outputRoot, "content", "Gallery", "Pictures.md"),
      "utf8",
    )
    assert.match(publishedNote, /cover: "\[\[Gallery\/Cover Photo\.jpg\]\]"/)
    assert.match(publishedNote, /!\[My drawing\]\(\.\/My%20Drawing\.png\)/)
    assert.doesNotMatch(publishedNote, /file:\/\//)
    assert.equal(
      fs.readFileSync(path.join(outputRoot, "content", "Gallery", coverName), "utf8"),
      "cover",
    )
    assert.equal(
      fs.readFileSync(path.join(outputRoot, "content", "Gallery", drawingName), "utf8"),
      "drawing",
    )
    const folderIndex = fs.readFileSync(
      path.join(outputRoot, "content", "Gallery", "index.md"),
      "utf8",
    )
    assert.doesNotMatch(folderIndex, /file:\/\//)
    const brainIndex = fs.readFileSync(
      path.join(outputRoot, "quartz", "static", "brain-index.json"),
      "utf8",
    )
    assert.doesNotMatch(brainIndex, /file:\/\//)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("publishes private aliases for local videos without exposing filenames", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-private-media-"))
  const gardenRoot = path.join(fixtureRoot, "Digital Garden")
  const moviesRoot = path.join(fixtureRoot, "Movies")
  const transcriptsRoot = path.join(moviesRoot, "Transkripte")
  const noteRoot = path.join(gardenRoot, "Media")
  const outputRoot = path.join(fixtureRoot, "site")
  const transcript = path.join(transcriptsRoot, "captions.vtt")
  const movie = path.join(moviesRoot, "Filme", "movie.mp4")
  const transcriptUrl = new URL(`file://${transcript}`).href
  const movieUrl = new URL(`file://${movie}`).href

  fs.mkdirSync(noteRoot, { recursive: true })
  fs.mkdirSync(path.dirname(transcript), { recursive: true })
  fs.mkdirSync(path.dirname(movie), { recursive: true })
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(transcript, "WEBVTT")
  fs.writeFileSync(movie, "private movie")
  fs.writeFileSync(
    path.join(noteRoot, "Movie.md"),
    [
      "---",
      "publish: true",
      `media: ${movieUrl}`,
      "captions:",
      `  - ${transcriptUrl}#lang=de`,
      `next: ${transcriptUrl}`,
      "---",
      `[Transcript](${transcriptUrl})`,
      `[01:23](${movieUrl}#t=83)`,
      `[movie.mp4](${movieUrl})`,
      `Direkter Link: ${movieUrl}#t=90`,
      "",
    ].join("\n"),
  )

  try {
    execFileSync(process.execPath, [syncScript], {
      cwd: outputRoot,
      env: {
        ...process.env,
        ZETTEL_SOURCE_ROOT: gardenRoot,
        ZETTEL_MOVIES_ROOT: moviesRoot,
        ZETTEL_TRANSCRIPTS_ROOT: transcriptsRoot,
      },
      stdio: "pipe",
    })

    const publishedNote = fs.readFileSync(
      path.join(outputRoot, "content", "Media", "Movie.md"),
      "utf8",
    )
    assert.doesNotMatch(publishedNote, /^captions:/m)
    assert.match(publishedNote, /^media: \/local-media\/[a-f0-9]{24}\.mp4$/m)
    assert.doesNotMatch(publishedNote, /^next:/m)
    assert.doesNotMatch(publishedNote, /file:\/\//)
    assert.doesNotMatch(publishedNote, /movie\.mp4/i)
    assert.match(publishedNote, /Transcript \(nicht öffentlich verfügbar\)/)
    assert.match(
      publishedNote,
      /\[01:23\]\(https:\/\/local-media\.invalid\/%2Flocal-media%2F[a-f0-9]{24}\.mp4\?t=83\)/,
    )
    assert.match(publishedNote, /\[Lokales Video\]\(\/local-media\/[a-f0-9]{24}\.mp4\)/)
    assert.match(
      publishedNote,
      /Direkter Link: https:\/\/local-media\.invalid\/%2Flocal-media%2F[a-f0-9]{24}\.mp4\?t=90/,
    )
    assert.equal(fs.existsSync(path.join(outputRoot, "content", "Media", "captions.vtt")), false)
    assert.equal(fs.existsSync(path.join(outputRoot, "content", "Media", "movie.mp4")), false)

    const manifest = JSON.parse(
      fs.readFileSync(path.join(outputRoot, "private", "local-media-aliases.json"), "utf8"),
    )
    const aliases = Object.entries(manifest.aliases)
    assert.equal(aliases.length, 1)
    assert.match(aliases[0][0], /^\/local-media\/[a-f0-9]{24}\.mp4$/)
    assert.equal(aliases[0][1], movie)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("publishes parenthesized local video and audio embeds through private aliases", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-private-av-"))
  const gardenRoot = path.join(fixtureRoot, "Digital Garden")
  const moviesRoot = path.join(fixtureRoot, "Movies")
  const noteRoot = path.join(gardenRoot, "Media")
  const outputRoot = path.join(fixtureRoot, "site")
  const mediaFolder = path.join(moviesRoot, "Episode")
  const video = path.join(mediaFolder, "Episode (1080p_30fps_H264-128kbit_AAC).mp4")
  const audio = path.join(mediaFolder, "Episode (128kbit_AAC).m4a")
  const cover = path.join(mediaFolder, "Episode (BQ).jpg")
  const videoUrl = new URL(`file://${video}`).href
  const audioUrl = new URL(`file://${audio}`).href
  const coverUrl = new URL(`file://${cover}`).href

  fs.mkdirSync(noteRoot, { recursive: true })
  fs.mkdirSync(mediaFolder, { recursive: true })
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(video, "private video")
  fs.writeFileSync(audio, "private audio")
  fs.writeFileSync(cover, "private cover")
  fs.writeFileSync(
    path.join(noteRoot, "Episode.md"),
    [
      "---",
      "publish: true",
      `media: ${audioUrl}`,
      `cover: ${coverUrl}`,
      "---",
      `![${path.basename(video)}](${videoUrl})`,
      `![${path.basename(audio)}](${audioUrl})`,
      "",
    ].join("\n"),
  )

  try {
    execFileSync(process.execPath, [syncScript], {
      cwd: outputRoot,
      env: {
        ...process.env,
        ZETTEL_SOURCE_ROOT: gardenRoot,
        ZETTEL_MOVIES_ROOT: moviesRoot,
      },
      stdio: "pipe",
    })

    const publishedNote = fs.readFileSync(
      path.join(outputRoot, "content", "Media", "Episode.md"),
      "utf8",
    )
    assert.match(publishedNote, /^media: \/local-media\/[a-f0-9]{24}\.m4a$/m)
    assert.match(publishedNote, /^cover: \/local-media\/[a-f0-9]{24}\.jpg$/m)
    assert.match(
      publishedNote,
      /<video controls playsinline preload="metadata" src="\/local-media\/[a-f0-9]{24}\.mp4" title="Lokales Video"><\/video>/,
    )
    assert.match(
      publishedNote,
      /<audio controls preload="metadata" src="\/local-media\/[a-f0-9]{24}\.m4a" title="Lokales Audio"><\/audio>/,
    )
    assert.doesNotMatch(publishedNote, /Episode \(/)
    assert.doesNotMatch(publishedNote, /nicht öffentlich verfügbar/)
    assert.doesNotMatch(publishedNote, /file:\/\//)

    const manifest = JSON.parse(
      fs.readFileSync(path.join(outputRoot, "private", "local-media-aliases.json"), "utf8"),
    )
    assert.deepEqual(new Set(Object.values(manifest.aliases)), new Set([video, audio, cover]))
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("anonymizes Obsidian video wikilinks without copying the video", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-video-wikilink-"))
  const gardenRoot = path.join(fixtureRoot, "Digital Garden")
  const noteRoot = path.join(gardenRoot, "Media")
  const outputRoot = path.join(fixtureRoot, "site")
  const videoName = "Private Original Title.webm"
  const videoPath = path.join(noteRoot, videoName)

  fs.mkdirSync(noteRoot, { recursive: true })
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(videoPath, "private video")
  fs.writeFileSync(
    path.join(noteRoot, "Video.md"),
    [
      "---",
      "publish: true",
      `media: "[[${videoName}]]"`,
      "---",
      `![[${videoName}]]`,
      `[[${videoName}#t=42|00:42]]`,
      `[[${videoName}|${videoName}]]`,
      "",
    ].join("\n"),
  )

  try {
    execFileSync(process.execPath, [syncScript], {
      cwd: outputRoot,
      env: { ...process.env, ZETTEL_SOURCE_ROOT: gardenRoot },
      stdio: "pipe",
    })

    const publishedNote = fs.readFileSync(
      path.join(outputRoot, "content", "Media", "Video.md"),
      "utf8",
    )
    assert.doesNotMatch(publishedNote, /Private Original Title/)
    assert.match(publishedNote, /^media: \/local-media\/[a-f0-9]{24}\.webm$/m)
    assert.match(
      publishedNote,
      /<video controls playsinline preload="metadata" src="\/local-media\/[a-f0-9]{24}\.webm" title="Lokales Video"><\/video>/,
    )
    assert.match(
      publishedNote,
      /\[00:42\]\(https:\/\/local-media\.invalid\/%2Flocal-media%2F[a-f0-9]{24}\.webm\?t=42\)/,
    )
    assert.match(publishedNote, /\[Lokales Video\]\(\/local-media\/[a-f0-9]{24}\.webm\)/)
    assert.equal(fs.existsSync(path.join(outputRoot, "content", "Media", videoName)), false)

    const manifest = JSON.parse(
      fs.readFileSync(path.join(outputRoot, "private", "local-media-aliases.json"), "utf8"),
    )
    assert.deepEqual(Object.values(manifest.aliases), [videoPath])
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("publishes notes from the entire vault while preserving Digital Garden routes", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-whole-vault-"))
  const vaultRoot = path.join(fixtureRoot, "Obsidian Vault")
  const gardenRoot = path.join(vaultRoot, "Digital Garden")
  const journalRoot = path.join(vaultRoot, "journal", "2026")
  const workspaceRoot = path.join(vaultRoot, "workspace")
  const outputRoot = path.join(fixtureRoot, "site")

  fs.mkdirSync(gardenRoot, { recursive: true })
  fs.mkdirSync(journalRoot, { recursive: true })
  fs.mkdirSync(workspaceRoot, { recursive: true })
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(
    path.join(gardenRoot, "Digital Garden.md"),
    "---\npublish: true\n---\n# Home\n[[Journal Entry]]\n",
  )
  fs.writeFileSync(
    path.join(journalRoot, "Journal Entry.md"),
    "---\npublish: true\n---\n# Journal Entry\n",
  )
  fs.writeFileSync(path.join(workspaceRoot, "Private.md"), "---\npublish: false\n---\n# Private\n")

  try {
    execFileSync(process.execPath, [syncScript], {
      cwd: outputRoot,
      env: { ...process.env, ZETTEL_SOURCE_ROOT: vaultRoot },
      stdio: "pipe",
    })

    const homepage = fs.readFileSync(path.join(outputRoot, "content", "index.md"), "utf8")
    assert.match(homepage, /\[\[journal\/2026\/journal-entry\|Journal Entry\]\]/)
    assert.equal(
      fs.existsSync(path.join(outputRoot, "content", "Digital Garden", "Digital Garden.md")),
      false,
    )
    assert.equal(
      fs.existsSync(path.join(outputRoot, "content", "journal", "2026", "Journal Entry.md")),
      true,
    )
    assert.equal(fs.existsSync(path.join(outputRoot, "content", "workspace", "Private.md")), false)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
