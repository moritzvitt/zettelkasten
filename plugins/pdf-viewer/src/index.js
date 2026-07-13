import { viewerScript } from "./runtime.generated.js"
import fs from "node:fs"
import path from "node:path"

const pdfjsRoot = path.resolve(import.meta.dirname, "../../../node_modules/pdfjs-dist")

async function* copyDirectory(source, destination) {
  await fs.promises.mkdir(destination, { recursive: true })
  for (const entry of await fs.promises.readdir(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name)
    const destinationPath = path.join(destination, entry.name)
    if (entry.isDirectory()) {
      yield* copyDirectory(sourcePath, destinationPath)
    } else {
      await fs.promises.copyFile(sourcePath, destinationPath)
      yield destinationPath
    }
  }
}

const viewerStyle = `
body.pdf-focus-active {
  overflow: hidden;
}

.pdf-embed {
  position: relative;
  width: 100%;
  margin: 1rem 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--darkgray) 16%, transparent);
  border-radius: 5px;
  background: var(--light);
}

.pdf-viewer-stage {
  position: relative;
  display: flex;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: min(72vh, 760px);
  min-height: 300px;
  padding: 0.75rem;
  overflow: hidden;
  background: var(--light);
}

.pdf-pages {
  display: grid;
  box-sizing: border-box;
  gap: 14px;
  align-items: start;
  justify-content: center;
  width: max-content;
  min-width: 100%;
  margin: auto;
}

.pdf-page-frame {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: var(--light);
}

.pdf-preview-pages .pdf-page-frame {
  background: transparent;
}

.pdf-page-placeholder {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--darkgray) 10%, transparent);
}

.pdf-page {
  display: block;
  flex: 0 0 auto;
  background: white;
  box-shadow: 0 2px 14px color-mix(in srgb, var(--dark) 14%, transparent);
}

:root[saved-theme="dark"] .pdf-embed.pdf-monochrome .pdf-page {
  filter: invert(1);
  mix-blend-mode: screen;
}

.pdf-loading {
  position: absolute;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  color: var(--darkgray);
}

.pdf-embed.is-ready .pdf-loading {
  display: none;
}

.pdf-corner-controls {
  position: absolute;
  top: 0.65rem;
  right: 0.65rem;
  z-index: 3;
  display: flex;
  gap: 0.35rem;
}

.pdf-focus,
.pdf-open,
.pdf-navigation button {
  display: inline-flex;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  min-width: 2.35rem;
  height: 2.35rem;
  margin: 0;
  padding: 0 0.65rem;
  border: 1px solid color-mix(in srgb, var(--darkgray) 22%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--light) 92%, transparent);
  color: var(--dark);
  box-shadow: 0 1px 5px color-mix(in srgb, var(--dark) 12%, transparent);
  font: inherit;
  line-height: 1;
  text-decoration: none;
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.pdf-focus:hover,
.pdf-open:hover,
.pdf-navigation button:hover:not(:disabled) {
  border-color: var(--secondary);
  color: var(--secondary);
}

.pdf-navigation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 3.4rem;
  padding: 0.45rem 0.7rem;
  border-top: 1px solid color-mix(in srgb, var(--darkgray) 14%, transparent);
  background: var(--light);
}

.pdf-page-controls,
.pdf-zoom-controls {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.pdf-page-controls {
  margin-left: auto;
}

.pdf-zoom-controls {
  margin-right: auto;
}

.pdf-zoom-reset {
  min-width: 4.5rem !important;
}

.pdf-navigation button:disabled {
  opacity: 0.35;
  cursor: default;
}

.pdf-page-status,
.pdf-zoom-status {
  min-width: 5rem;
  color: var(--darkgray);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.pdf-zoom-status {
  min-width: auto;
  color: inherit;
  pointer-events: none;
}

.pdf-mobile-open {
  display: none;
}

.pdf-mobile-open.internal,
.pdf-mobile-open.internal:hover {
  padding: 0 !important;
  border-radius: 0;
  background: transparent !important;
  color: transparent !important;
}

.pdf-embed.is-focused {
  position: fixed;
  inset: 1rem;
  z-index: 10000;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  width: auto;
  margin: 0;
  border-color: color-mix(in srgb, var(--darkgray) 30%, transparent);
  box-shadow: 0 12px 60px color-mix(in srgb, black 45%, transparent);
}

.pdf-embed.is-focused .pdf-viewer-stage {
  display: block;
  height: auto !important;
  min-height: 0;
  padding: 0.75rem;
  overflow: auto;
  scrollbar-gutter: stable;
}

.pdf-embed.is-focused .pdf-pages {
  margin: 0 auto;
  padding-bottom: 1rem;
}

.pdf-embed.is-zoomed:not(.is-focused) .pdf-viewer-stage {
  align-items: flex-start;
  justify-content: flex-start;
  overflow: auto;
  scrollbar-gutter: stable;
}

@media (max-width: 600px) {
  .pdf-viewer-stage {
    height: min(68vh, 36rem) !important;
    min-height: 260px;
    padding: 0.5rem;
  }

  .pdf-focus {
    display: none;
  }

  .pdf-zoom-controls {
    display: none;
  }

  .pdf-navigation {
    justify-content: center;
  }

  .pdf-page-controls {
    margin: 0;
  }

  .pdf-mobile-open {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: block;
  }

  .pdf-corner-controls {
    z-index: 4;
  }

  .pdf-page {
    pointer-events: none;
  }
}
`

export default function PdfViewer() {
  return {
    name: "PdfViewer",
    async *emit(ctx) {
      for (const directory of ["wasm", "standard_fonts", "cmaps"]) {
        yield* copyDirectory(
          path.join(pdfjsRoot, directory),
          path.join(ctx.argv.output, "static", "pdfjs", directory),
        )
      }
    },
    externalResources() {
      return {
        js: [
          {
            script: viewerScript,
            loadTime: "afterDOMReady",
            contentType: "inline",
          },
        ],
        css: [
          {
            content: viewerStyle,
            inline: true,
          },
        ],
      }
    },
  }
}
