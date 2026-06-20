import { lstat, mkdir, readlink, rm, symlink } from "node:fs/promises"
import path from "node:path"

const projectRoot = process.cwd()
const localPlugins = [
  "explorer",
  "graph",
  "contribute",
  "structured-brain",
  "vocap-trainer",
  "local-media-player",
  "discord-spoilers",
  "svg-viewer",
]

for (const name of localPlugins) {
  const source = path.join(projectRoot, "plugins", name)
  const target = path.join(projectRoot, ".quartz/plugins", name)

  await mkdir(path.dirname(target), { recursive: true })

  try {
    const stat = await lstat(target)
    if (stat.isSymbolicLink() && (await readlink(target)) === source) continue
    await rm(target, { recursive: true, force: true })
  } catch {
    // The plugin has not been installed yet.
  }

  await symlink(source, target, "dir")
}

console.log(`Using project-local plugins: ${localPlugins.join(", ")}`)
