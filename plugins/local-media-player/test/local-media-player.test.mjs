import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import LocalMediaPlayer, { rewriteMediaTimestampLinks } from "../src/index.js"

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
