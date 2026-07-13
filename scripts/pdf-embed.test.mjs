import assert from "node:assert/strict"
import test from "node:test"

import { renderPdfEmbed } from "./pdf-embed.mjs"

test("renders a paged PDF preview with focus and full-document controls", () => {
  const markup = renderPdfEmbed({
    href: "./score.pdf",
    title: "Score",
    styleAttribute: ' style="height: 600px"',
  })

  assert.match(markup, /<div class="pdf-embed pdf-monochrome"[^>]+data-pdf-src="\.\/score\.pdf"/)
  assert.match(markup, /<div class="pdf-viewer-stage" style="height: 600px">/)
  assert.match(markup, /class="pdf-pages pdf-preview-pages"/)
  assert.match(markup, /class="pdf-previous"[^>]+aria-label="Vorherige PDF-Seite"/)
  assert.match(markup, /class="pdf-page-status"[^>]+aria-live="polite"/)
  assert.match(markup, /class="pdf-next"[^>]+aria-label="Nächste PDF-Seite"/)
  assert.match(markup, /class="pdf-zoom-out"[^>]+aria-label="PDF verkleinern"/)
  assert.match(markup, /class="pdf-zoom-reset"[^>]+aria-label="PDF-Seiten einpassen"/)
  assert.match(markup, /class="pdf-zoom-in"[^>]+aria-label="PDF vergrößern"/)
  assert.match(markup, /class="pdf-focus"[^>]+aria-label="PDF im Fokusmodus öffnen"/)
  assert.match(markup, /class="pdf-mobile-open"[^>]+href="\.\/score\.pdf"/)
  assert.match(markup, /<a class="pdf-open"[^>]+href="\.\/score\.pdf"/)
  assert.match(markup, /target="_blank"/)
  assert.match(markup, /data-router-ignore/)
  assert.match(markup, /aria-label="PDF vollständig öffnen: Score"/)
  assert.doesNotMatch(markup, /<iframe/)
})
