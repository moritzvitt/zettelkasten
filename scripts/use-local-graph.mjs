import { lstat, mkdir, readlink, rm, symlink } from "node:fs/promises"
import path from "node:path"

const projectRoot = process.cwd()
const source = path.join(projectRoot, "plugins/graph")
const target = path.join(projectRoot, ".quartz/plugins/graph")

await mkdir(path.dirname(target), { recursive: true })

try {
  const stat = await lstat(target)
  if (stat.isSymbolicLink() && (await readlink(target)) === source) process.exit(0)
  await rm(target, { recursive: true, force: true })
} catch {
  // The plugin has not been installed yet.
}

await symlink(source, target, "dir")
console.log("Using project-local graph plugin")
