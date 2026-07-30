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

test("keeps transcripts and local videos out of published content", () => {
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
    assert.doesNotMatch(publishedNote, /^media:/m)
    assert.doesNotMatch(publishedNote, /^next:/m)
    assert.doesNotMatch(publishedNote, /file:\/\//)
    assert.match(publishedNote, /Transcript \(nicht öffentlich verfügbar\)/)
    assert.match(publishedNote, /01:23/)
    assert.equal(fs.existsSync(path.join(outputRoot, "content", "Media", "captions.vtt")), false)
    assert.equal(fs.existsSync(path.join(outputRoot, "content", "Media", "movie.mp4")), false)
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
