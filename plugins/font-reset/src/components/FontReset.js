import { h } from "preact"

function classNames(...classes) {
  return classes.filter(Boolean).join(" ")
}

const script = `
const fontResetStorageKey = "quartz-standard-font"

function getStoredFontMode() {
  try {
    return localStorage.getItem(fontResetStorageKey)
  } catch {
    return null
  }
}

function setStoredFontMode(mode) {
  try {
    localStorage.setItem(fontResetStorageKey, mode)
  } catch {}
}

function setStandardFont(enabled) {
  const mode = enabled ? "on" : "off"
  document.documentElement.setAttribute("standard-font", mode)
  setStoredFontMode(mode)

  for (const button of document.getElementsByClassName("font-reset")) {
    button.setAttribute("aria-pressed", String(enabled))
    button.setAttribute(
      "aria-label",
      enabled ? "Handschrift wieder aktivieren" : "Standardschrift aktivieren",
    )
    button.title = enabled ? "Handschrift wieder aktivieren" : "Standardschrift aktivieren"
  }
}

function setupFontReset() {
  const initialMode = getStoredFontMode() === "on"
  setStandardFont(initialMode)

  for (const button of document.getElementsByClassName("font-reset")) {
    if (button.dataset.fontResetBound === "true") continue
    button.dataset.fontResetBound = "true"

    const switchFont = () => {
      setStandardFont(document.documentElement.getAttribute("standard-font") !== "on")
    }

    button.addEventListener("click", switchFont)
    if (typeof window.addCleanup === "function") {
      window.addCleanup(() => {
        button.dataset.fontResetBound = "false"
        button.removeEventListener("click", switchFont)
      })
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupFontReset, { once: true })
} else {
  setupFontReset()
}

window.addEventListener("pageshow", setupFontReset)
document.addEventListener("nav", setupFontReset)
document.addEventListener("render", setupFontReset)
`

const styles = `
.font-reset {
  cursor: pointer;
  padding: 0;
  position: relative;
  background: none;
  border: none;
  width: 20px;
  height: 32px;
  margin: 0;
  text-align: inherit;
  flex-shrink: 0;
  color: var(--darkgray);
}

.font-reset-icon {
  position: absolute;
  inset: 50% auto auto 50%;
  display: block;
  width: 20px;
  height: 20px;
  transform: translate(-50%, -50%);
  font-family: "PingFang SC", "Hiragino Sans GB", "Songti SC", "Noto Serif CJK SC", serif;
  font-size: 20px;
  font-weight: 600;
  line-height: 20px;
  text-align: center;
  transition:
    color 0.1s ease,
    opacity 0.1s ease,
    text-shadow 0.1s ease;
}

.font-reset:hover .font-reset-icon,
.font-reset:focus-visible .font-reset-icon,
:root[standard-font="on"] .font-reset-icon {
  color: var(--secondary);
  text-shadow: 0 0 0.45rem color-mix(in srgb, var(--secondary) 42%, transparent);
}

.font-reset:focus-visible {
  outline: 1px solid var(--secondary);
  outline-offset: 3px;
}
`

export default function FontReset() {
  const Component = ({ displayClass }) =>
    h(
      "button",
      {
        class: classNames(displayClass, "font-reset"),
        type: "button",
        "aria-label": "Standardschrift aktivieren",
        "aria-pressed": "false",
        title: "Standardschrift aktivieren",
      },
      h("span", { class: "font-reset-icon", "aria-hidden": "true" }, "字"),
    )

  Component.beforeDOMLoaded = script
  Component.css = styles
  return Component
}
