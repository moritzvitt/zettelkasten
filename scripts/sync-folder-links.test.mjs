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
        path.join(
          outputRoot,
          "content",
          "media-lib",
          "Movies",
          "Example Movie",
          coverName,
        ),
      ),
      coverContents,
    )
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
