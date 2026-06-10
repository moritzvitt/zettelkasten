import { visit } from "unist-util-visit"

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

export function spoilerHtml(value) {
  return `<span class="discord-spoiler" tabindex="0" role="button" aria-label="Spoiler"><span>${escapeHtml(value)}</span></span>`
}

export function spoilerElement(value) {
  return {
    type: "element",
    tagName: "span",
    properties: {
      className: ["discord-spoiler"],
      tabIndex: 0,
      role: "button",
      ariaLabel: "Spoiler",
    },
    children: [
      {
        type: "element",
        tagName: "span",
        properties: {},
        children: [{ type: "text", value }],
      },
    ],
  }
}

export function splitDiscordSpoilers(value) {
  const parts = []
  const pattern = /\|\|([^|\n]+?)\|\|/g
  let lastIndex = 0
  let match

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: value.slice(lastIndex, match.index) })
    }
    parts.push({ type: "html", value: spoilerHtml(match[1]) })
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < value.length) {
    parts.push({ type: "text", value: value.slice(lastIndex) })
  }

  return parts
}

export function splitDiscordSpoilerElements(value) {
  const parts = []
  const pattern = /\|\|([^|\n]+?)\|\|/g
  let lastIndex = 0
  let match

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: value.slice(lastIndex, match.index) })
    }
    parts.push(spoilerElement(match[1]))
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < value.length) {
    parts.push({ type: "text", value: value.slice(lastIndex) })
  }

  return parts
}

function discordSpoilerMarkdown() {
  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (typeof node.value !== "string" || !node.value.includes("||")) return
      if (!parent || !Array.isArray(parent.children) || typeof index !== "number") return

      const replacement = splitDiscordSpoilers(node.value)
      if (replacement.length === 1 && replacement[0]?.type === "text") return

      parent.children.splice(index, 1, ...replacement)
      return index + replacement.length
    })
  }
}

function discordSpoilerHtml() {
  const ignoredParents = new Set(["code", "pre", "script", "style"])

  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (typeof node.value !== "string" || !node.value.includes("||")) return
      if (!parent || !Array.isArray(parent.children) || typeof index !== "number") return
      if (ignoredParents.has(parent.tagName)) return
      if (parent.properties?.className?.includes?.("discord-spoiler")) return

      const replacement = splitDiscordSpoilerElements(node.value)
      if (replacement.length === 1 && replacement[0]?.type === "text") return

      parent.children.splice(index, 1, ...replacement)
      return index + replacement.length
    })
  }
}

const spoilerStyle = `
.discord-spoiler {
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--secondary) 26%, transparent),
      color-mix(in srgb, var(--tertiary) 22%, transparent)
    ),
    color-mix(in srgb, var(--highlight) 40%, var(--light));
  border: 1px solid color-mix(in srgb, var(--secondary) 34%, transparent);
  border-radius: 0.32em;
  color: transparent;
  cursor: pointer;
  padding: 0 0.18em;
  text-decoration: none;
  transition:
    background 120ms ease,
    border-color 120ms ease,
    box-shadow 120ms ease,
    color 120ms ease;
}

.discord-spoiler > span {
  opacity: 0;
  transition: opacity 120ms ease;
}

.discord-spoiler:hover,
.discord-spoiler:focus,
.discord-spoiler:active {
  background: color-mix(in srgb, var(--highlight) 28%, transparent);
  border-color: color-mix(in srgb, var(--secondary) 42%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--highlight) 40%, transparent);
  color: inherit;
  cursor: none;
  outline: none;
}

.discord-spoiler:hover > span,
.discord-spoiler:focus > span,
.discord-spoiler:active > span {
  opacity: 1;
}
`

export default function DiscordSpoilers() {
  return {
    name: "DiscordSpoilers",
    markdownPlugins() {
      return [discordSpoilerMarkdown]
    },
    htmlPlugins() {
      return [discordSpoilerHtml]
    },
    externalResources() {
      return {
        css: [
          {
            content: spoilerStyle,
            inline: true,
          },
        ],
      }
    },
  }
}
