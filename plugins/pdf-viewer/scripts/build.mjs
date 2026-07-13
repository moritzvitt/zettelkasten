import { build } from "esbuild"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const dist = path.join(root, "dist")
const workerPath = path.resolve(root, "../../node_modules/pdfjs-dist/build/pdf.worker.mjs")

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })

const workerResult = await build({
  entryPoints: [workerPath],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: ["safari16.4"],
  write: false,
})
const workerSource = workerResult.outputFiles[0].text

const result = await build({
  entryPoints: [path.join(root, "src/runtime.js")],
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: ["safari16.4"],
  write: false,
  define: {
    __PDF_WORKER_SOURCE__: JSON.stringify(workerSource),
  },
})

const runtime = result.outputFiles[0].text
const indexSource = await readFile(path.join(root, "src/index.js"), "utf8")
await writeFile(
  path.join(dist, "runtime.generated.js"),
  `export const viewerScript = ${JSON.stringify(runtime)}\n`,
)
await writeFile(path.join(dist, "index.js"), indexSource)

console.log("Built pdf-viewer plugin")
