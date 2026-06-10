import { cp, mkdir, rm } from "node:fs/promises"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const src = path.join(root, "src")
const dist = path.join(root, "dist")

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
await cp(src, dist, { recursive: true })

console.log("Built local-media-player plugin")
