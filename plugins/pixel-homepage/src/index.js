import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

const assets = [
  "homepage.js",
  "koi10.png",
  "koi-water-sound.m4a",
  "newspaper.png",
  "sakura_cup.png",
  "teekanne.png",
  "teapot-hop-sound.mp3",
  "zettelhaufen.png",
]

async function installPixelHomepage(ctx) {
  const root = process.cwd()
  const sourceDir = path.join(root, "pixel art website")
  const outputDir = ctx.argv.output
  const pixelDir = path.join(outputDir, "pixel")
  const emitted = []

  await mkdir(pixelDir, { recursive: true })

  for (const asset of assets) {
    const dest = path.join(pixelDir, asset)
    await copyFile(path.join(sourceDir, asset), dest)
    emitted.push(dest)
  }

  const html = await readFile(path.join(sourceDir, "index.html"), "utf8")
  const indexPath = path.join(outputDir, "index.html")
  await writeFile(indexPath, html)
  emitted.push(indexPath)

  for (const asset of assets) {
    await rm(path.join(outputDir, asset), { force: true })
  }

  return emitted
}

export default function PixelHomepage() {
  return {
    name: "PixelHomepage",
    emit: installPixelHomepage,
    partialEmit: installPixelHomepage,
  }
}
