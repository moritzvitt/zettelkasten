import { readdir, writeFile } from "node:fs/promises"
import path from "node:path"

const root = path.join(process.cwd(), ".quartz/plugins")

try {
  const entries = await readdir(root, { withFileTypes: true })
  const plugins = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  const lines = ["// Generated fallback plugin index for local Quartz build."]
  for (const name of plugins) {
    lines.push(`export * from "./${name}/dist/index.js"`)
  }
  await writeFile(path.join(root, "index.ts"), `${lines.join("\n")}\n`)
  console.log(`Ensured Quartz plugin index for ${plugins.length} plugins`)
} catch (error) {
  console.warn(`Could not ensure Quartz plugin index: ${error instanceof Error ? error.message : String(error)}`)
}
