import { readFile, writeFile } from "node:fs/promises"

const configPath = "quartz.config.yaml"
const baseUrl = process.env.QUARTZ_BASE_URL

if (!baseUrl) {
  console.log("QUARTZ_BASE_URL is not set; keeping quartz.config.yaml unchanged")
  process.exit(0)
}

const normalized = baseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")
const config = await readFile(configPath, "utf8")

if (!/^\s*baseUrl:/m.test(config)) {
  throw new Error("Could not find baseUrl in quartz.config.yaml")
}

await writeFile(configPath, config.replace(/^(\s*baseUrl:\s*).+$/m, `$1${normalized}`))
console.log(`Configured Quartz baseUrl: ${normalized}`)
