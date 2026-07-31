import assert from "node:assert/strict"
import http from "node:http"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import serveHandler from "serve-handler"
import { serveHandlerOptions } from "./handlers.js"

test("serves local media symlinks from the Quartz output", async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "quartz-media-server-"))
  const outputRoot = path.join(fixtureRoot, "public")
  const sourcePath = path.join(fixtureRoot, "private-video.mp4")
  const aliasPath = path.join(outputRoot, "local-media", "opaque-alias.mp4")
  fs.mkdirSync(path.dirname(aliasPath), { recursive: true })
  fs.writeFileSync(sourcePath, "video bytes")
  fs.symlinkSync(sourcePath, aliasPath)

  const server = http.createServer((request, response) =>
    serveHandler(request, response, serveHandlerOptions(outputRoot)),
  )
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))

  try {
    const address = server.address()
    const response = await fetch(`http://127.0.0.1:${address.port}/local-media/opaque-alias.mp4`)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), "video bytes")

    const rangeResponse = await fetch(
      `http://127.0.0.1:${address.port}/local-media/opaque-alias.mp4`,
      { headers: { Range: "bytes=0-4" } },
    )
    assert.equal(rangeResponse.status, 206)
    assert.equal(rangeResponse.headers.get("content-range"), "bytes 0-4/11")
    assert.equal(await rangeResponse.text(), "video")
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
