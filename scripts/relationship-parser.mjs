export const relationshipNames = ["Prev", "Next", "Parent", "Child", "Friend"]

export const relationshipTypes = {
  Parent: "parent",
  Child: "child",
  Prev: "prev",
  Next: "next",
  Friend: "friend",
}

export const inverseRelationshipTypes = {
  parent: "child",
  child: "parent",
  prev: "next",
  next: "prev",
  friend: "friend",
}

function cleanTarget(value) {
  return value
    .replace(/^LLM Wiki\/workspace\/bin\//, "")
    .replace(/^LLM Wiki\/notes\/zettel\//, "")
    .replace(/\.md$/, "")
    .split("/")
    .pop()
    .trim()
}

function linksSection(markdown) {
  const lines = String(markdown || "").split(/\r?\n/)
  const headingIndex = lines.findIndex((line) => /^\s*#{1,6}\s+Links\s*$/i.test(line))
  if (headingIndex === -1) return ""

  const section = []
  for (let index = headingIndex + 1; index < lines.length; index++) {
    if (/^\s*#{1,6}\s+/.test(lines[index])) break
    if (/^\s*%%\s*$/.test(lines[index])) break
    section.push(lines[index])
  }
  return section.join("\n")
}

function wikiLinkTargets(value) {
  const targets = []
  const wikiLink = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g
  for (const match of String(value || "").matchAll(wikiLink)) {
    const target = cleanTarget(match[1])
    if (target) targets.push(target)
  }
  return targets
}

export function parseLinksSection(markdown) {
  const section = linksSection(markdown)
  const byType = Object.fromEntries(relationshipNames.map((name) => [name, []]))

  for (const line of section.split(/\r?\n/)) {
    const field = line.match(/^\s*(Parent|Child|Prev|Next|Friend)\s*::\s*(.*)$/i)
    if (!field) continue
    const name = relationshipNames.find(
      (candidate) => candidate.toLowerCase() === field[1].toLowerCase(),
    )
    byType[name].push(...wikiLinkTargets(field[2]))
  }

  for (const name of relationshipNames) {
    byType[name] = [...new Set(byType[name])]
  }

  const relationships = relationshipNames.flatMap((name) =>
    byType[name].map((target) => ({
      type: relationshipTypes[name],
      target,
    })),
  )

  return { byType, relationships }
}

export function withInverseRelationships(relationships) {
  const result = []
  const byKey = new Map()

  const add = (relationship, explicit) => {
    const key = `${relationship.from}\u0000${relationship.to}\u0000${relationship.type}`
    const existing = byKey.get(key)
    if (existing) {
      existing.explicit ||= explicit
      return
    }
    const value = {
      from: relationship.from,
      to: relationship.to,
      type: relationship.type,
      explicit,
    }
    byKey.set(key, value)
    result.push(value)
  }

  for (const relationship of relationships) {
    const explicit = relationship.explicit !== false
    add(relationship, explicit)
    add(
      {
        from: relationship.to,
        to: relationship.from,
        type: inverseRelationshipTypes[relationship.type],
      },
      false,
    )
  }

  return result
}
