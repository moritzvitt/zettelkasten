import { simplifySlug } from "@quartz-community/utils"
import type { FullSlug, SimpleSlug } from "@quartz-community/types"

export function normalizeGraphSlug(value: string | undefined | null): SimpleSlug {
  let slug = String(value || "")
  try {
    slug = decodeURIComponent(slug)
  } catch {
    // Keep malformed URL fragments readable instead of breaking the graph.
  }

  slug =
    slug
      .replace(/^https?:\/\/[^/]+/i, "")
      .split(/[?#]/)[0] || ""
  slug = slug
    .replace(/\.html$/i, "")
    .replace(/^\/+|\/+$/g, "")

  return simplifySlug(slug as FullSlug)
}

export function canonicalGraphSlug(
  pageSlug: string | undefined,
  urlSlug: string | undefined,
): SimpleSlug {
  return normalizeGraphSlug(pageSlug || urlSlug)
}

export function resolveGraphSlug(candidate: string, validSlugs: Set<string>): SimpleSlug {
  const normalized = normalizeGraphSlug(candidate)
  if (validSlugs.has(normalized)) return normalized

  const parts = normalized.split("/")
  for (let index = 1; index < parts.length; index++) {
    const suffix = parts.slice(index).join("/") as SimpleSlug
    if (validSlugs.has(suffix)) return suffix
  }

  return normalized
}
