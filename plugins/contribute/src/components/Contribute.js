import { h } from "preact"

const defaultOptions = {
  repositoryUrl: "https://github.com/moritzvitt/zettelkasten",
  zipUrl: "https://github.com/moritzvitt/zettelkasten/archive/refs/heads/v5.zip",
  markdownUrl: "https://github.com/moritzvitt/zettelkasten/tree/v5/content",
}

function classNames(...classes) {
  return classes.filter(Boolean).join(" ")
}

function pageTitle(fileData) {
  return fileData?.frontmatter?.title ?? fileData?.slug ?? "Unbekannter Zettel"
}

function pageUrl(fileData) {
  if (!fileData?.slug) return ""
  return `/${fileData.slug}`
}

function field(id, label, child) {
  return h("label", { class: "contribute-field", for: id }, h("span", null, label), child)
}

function textInput(id, name, props = {}) {
  return h("input", { id, name, ...props })
}

function textarea(id, name, props = {}) {
  return h("textarea", { id, name, ...props })
}

export default function Contribute(userOpts = {}) {
  const options = { ...defaultOptions, ...userOpts }

  const Component = ({ displayClass, fileData }) => {
    const title = pageTitle(fileData)
    const url = pageUrl(fileData)

    return h(
      "section",
      { class: classNames(displayClass, "contribute-panel") },
      h("h3", null, "Mitmachen"),
      h(
        "details",
        { class: "contribute-card" },
        h("summary", null, "Verbesserung vorschlagen"),
        h(
          "form",
          {
            name: "zettel-feedback",
            method: "POST",
            "data-netlify": "true",
            "netlify-honeypot": "bot-field",
          },
          h("input", { type: "hidden", name: "form-name", value: "zettel-feedback" }),
          h("input", { type: "hidden", name: "page-title", value: title }),
          h("input", { type: "hidden", name: "page-url", value: url }),
          h("p", { class: "contribute-hidden" }, field("feedback-bot", "Nicht ausfuellen", textInput("feedback-bot", "bot-field"))),
          field(
            "feedback-kind",
            "Art",
            h(
              "select",
              { id: "feedback-kind", name: "kind" },
              h("option", { value: "korrektur" }, "Korrektur"),
              h("option", { value: "ergaenzung" }, "Ergaenzung"),
              h("option", { value: "gegenargument" }, "Gegenargument"),
              h("option", { value: "frage" }, "Frage"),
            ),
          ),
          field(
            "feedback-message",
            "Vorschlag",
            textarea("feedback-message", "message", {
              rows: 5,
              required: true,
              placeholder: "Was sollte ich korrigieren, ergaenzen oder anders sehen?",
            }),
          ),
          field(
            "feedback-contact",
            "Kontakt optional",
            textInput("feedback-contact", "contact", {
              type: "text",
              placeholder: "Name oder E-Mail",
            }),
          ),
          h("button", { type: "submit" }, "Absenden"),
        ),
      ),
      h(
        "details",
        { class: "contribute-card" },
        h("summary", null, "Einen Zettel einreichen"),
        h(
          "form",
          {
            name: "zettel-submission",
            method: "POST",
            enctype: "multipart/form-data",
            "data-netlify": "true",
            "netlify-honeypot": "bot-field",
          },
          h("input", { type: "hidden", name: "form-name", value: "zettel-submission" }),
          h("p", { class: "contribute-hidden" }, field("submission-bot", "Nicht ausfuellen", textInput("submission-bot", "bot-field"))),
          field(
            "submission-title",
            "Titel",
            textInput("submission-title", "title", {
              type: "text",
              required: true,
              placeholder: "Arbeitstitel des Zettels",
            }),
          ),
          field(
            "submission-text",
            "Markdown oder Text",
            textarea("submission-text", "markdown", {
              rows: 7,
              placeholder: "Hier kann ein kompletter Zettel oder ein Vorschlag stehen.",
            }),
          ),
          field(
            "submission-file",
            "Markdown-Datei",
            textInput("submission-file", "markdown-file", {
              type: "file",
              accept: ".md,text/markdown,text/plain",
            }),
          ),
          field(
            "submission-contact",
            "Kontakt optional",
            textInput("submission-contact", "contact", {
              type: "text",
              placeholder: "Name oder E-Mail",
            }),
          ),
          h(
            "label",
            { class: "contribute-check" },
            h("input", { type: "checkbox", name: "rights-confirmed", required: true }),
            h("span", null, "Ich habe die Rechte am eingereichten Text."),
          ),
          h("button", { type: "submit" }, "Einreichen"),
        ),
      ),
      h(
        "div",
        { class: "contribute-links" },
        h("a", { href: options.repositoryUrl }, "GitHub"),
        h("a", { href: options.zipUrl }, "ZIP"),
        h("a", { href: options.markdownUrl }, "Markdown-Ordner"),
      ),
    )
  }

  Component.css = `
.contribute-panel {
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.9rem;
  background: color-mix(in srgb, var(--light) 94%, var(--secondary));
}

.contribute-panel h3 {
  margin: 0 0 0.65rem;
  font-size: 1rem;
}

.contribute-card {
  border-top: 1px solid var(--lightgray);
  padding: 0.55rem 0;
}

.contribute-card:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.contribute-card summary {
  cursor: pointer;
  font-weight: 700;
  color: var(--dark);
}

.contribute-card form {
  display: grid;
  gap: 0.65rem;
  margin-top: 0.7rem;
}

.contribute-field {
  display: grid;
  gap: 0.25rem;
  font-size: 0.82rem;
  color: var(--darkgray);
}

.contribute-field input,
.contribute-field textarea,
.contribute-field select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  padding: 0.45rem 0.5rem;
  background: var(--light);
  color: var(--dark);
  font: inherit;
}

.contribute-field textarea {
  min-height: 6rem;
  resize: vertical;
}

.contribute-check {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.45rem;
  align-items: start;
  font-size: 0.82rem;
  color: var(--darkgray);
}

.contribute-panel button {
  justify-self: start;
  border: 1px solid var(--secondary);
  border-radius: 6px;
  padding: 0.45rem 0.75rem;
  background: var(--secondary);
  color: var(--light);
  font-weight: 700;
  cursor: pointer;
}

.contribute-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--lightgray);
}

.contribute-links a {
  font-size: 0.82rem;
}

.contribute-hidden {
  display: none;
}
`

  return Component
}
