import path from "node:path"

export function assetHref(target) {
  return `./${path.basename(target)}`
}
