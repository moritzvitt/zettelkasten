import { h } from "preact"

function hasVocapTrainer(frontmatter = {}) {
  const value = frontmatter["vocab-trainer"]
  if (value === undefined || value === null) return false
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0

  return !["", "false", "no", "nein", "0", "off"].includes(
    String(value).trim().toLocaleLowerCase("de"),
  )
}

export default function VocapTrainer() {
  const Component = ({ displayClass, fileData }) => {
    if (!hasVocapTrainer(fileData?.frontmatter)) return null

    return h(
      "section",
      {
        class: [displayClass, "vocap-trainer"].filter(Boolean).join(" "),
        "data-vocap-trainer": "true",
      },
      h(
        "div",
        { class: "vocap-trainer-bar" },
        h("div", null, h("strong", null, "Lernliste"), h("span", null, "einmal ueben")),
        h("button", { type: "button", class: "vocap-start" }, "Vokabeln ueben"),
      ),
      h(
        "dialog",
        { class: "vocap-dialog" },
        h(
          "form",
          { method: "dialog", class: "vocap-dialog-top" },
          h("span", { class: "vocap-progress", "aria-live": "polite" }),
          h("button", { type: "submit", class: "vocap-icon-button", "aria-label": "Schliessen" }, "x"),
        ),
        h(
          "div",
          { class: "vocap-card" },
          h("p", { class: "vocap-label" }, "Ausdruck"),
          h("div", { class: "vocap-front" }),
          h("div", { class: "vocap-reading" }),
          h("div", { class: "vocap-answer", hidden: true }, h("p", { class: "vocap-label" }, "Bedeutung"), h("div", { class: "vocap-back" })),
        ),
        h("p", { class: "vocap-empty", hidden: true }, "Keine Lernliste gefunden."),
        h(
          "div",
          { class: "vocap-actions" },
          h("button", { type: "button", class: "vocap-show" }, "Antwort zeigen"),
          h("button", { type: "button", class: "vocap-next" }, "Naechste"),
          h("button", { type: "button", class: "vocap-reset" }, "Neu starten"),
        ),
      ),
    )
  }

  Component.css = `
.vocap-trainer {
  margin: 1.5rem 0 0;
}

.vocap-trainer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  padding: 0.75rem 0.85rem;
  background: color-mix(in srgb, var(--light) 94%, var(--secondary));
}

.vocap-trainer-bar div {
  display: grid;
  gap: 0.05rem;
}

.vocap-trainer-bar strong {
  font-size: 0.95rem;
  color: var(--dark);
}

.vocap-trainer-bar span,
.vocap-label,
.vocap-progress,
.vocap-empty {
  color: var(--gray);
  font-size: 0.85rem;
}

.vocap-start,
.vocap-show,
.vocap-next,
.vocap-reset,
.vocap-icon-button {
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  background: var(--light);
  color: var(--dark);
  font: inherit;
  cursor: pointer;
}

.vocap-start,
.vocap-show,
.vocap-next,
.vocap-reset {
  min-height: 2.25rem;
  padding: 0.35rem 0.75rem;
}

.vocap-start,
.vocap-next {
  background: var(--secondary);
  border-color: var(--secondary);
  color: var(--light);
}

.vocap-dialog {
  width: min(34rem, calc(100vw - 2rem));
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  padding: 1rem;
  background: var(--light);
  color: var(--dark);
}

.vocap-dialog::backdrop {
  background: rgba(0, 0, 0, 0.38);
}

.vocap-dialog-top,
.vocap-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.vocap-dialog-top {
  margin-bottom: 0.9rem;
}

.vocap-actions {
  flex-wrap: wrap;
  margin-top: 1rem;
}

.vocap-icon-button {
  width: 2rem;
  height: 2rem;
  padding: 0;
  line-height: 1;
}

.vocap-card {
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  padding: 1rem;
  min-height: 13rem;
}

.vocap-label {
  margin: 0 0 0.35rem;
}

.vocap-front {
  font-size: 1.8rem;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.vocap-reading {
  min-height: 1.4rem;
  margin-top: 0.35rem;
  color: var(--darkgray);
}

.vocap-answer {
  margin-top: 1.1rem;
  border-top: 1px solid var(--lightgray);
  padding-top: 0.8rem;
}

.vocap-back {
  overflow-wrap: anywhere;
}

@media (max-width: 600px) {
  .vocap-trainer-bar,
  .vocap-dialog-top,
  .vocap-actions {
    align-items: stretch;
  }

  .vocap-trainer-bar {
    flex-direction: column;
  }

  .vocap-start,
  .vocap-show,
  .vocap-next,
  .vocap-reset {
    width: 100%;
  }
}
`

  Component.afterDOMLoaded = `
function vocapText(node) {
  return (node && node.textContent ? node.textContent : "").replace(/\\s+/g, " ").trim();
}

function vocapPlain(text) {
  return String(text || "")
    .replace(/\\|\\|/g, "")
    .replace(/[🍙❗️]/g, "")
    .replace(/\\s+/g, " ")
    .trim();
}

function vocapSplitEntry(text) {
  var cleaned = vocapPlain(text).replace(/^\\d{1,2}:\\d{2}(?::\\d{2})?\\s*/, "");
  var separator = cleaned.match(/\\s+[—-]\\s+/);
  if (!separator) return null;

  var frontPart = cleaned.slice(0, separator.index).trim();
  var back = cleaned.slice(separator.index + separator[0].length).trim();
  var reading = "";
  var readingMatch = frontPart.match(/[（(]([^）)]+)[）)]\\s*$/);

  if (readingMatch) {
    reading = readingMatch[1].trim();
    frontPart = frontPart.slice(0, readingMatch.index).trim();
  }

  frontPart = frontPart.replace(/^["“]|["”]$/g, "").trim();
  if (!frontPart || !back) return null;

  return { front: frontPart, reading: reading, back: back };
}

function vocapItems() {
  var article = document.querySelector("article") || document.querySelector("main") || document.body;
  var headings = Array.from(article.querySelectorAll("h2, h3"));
  var heading = headings.find(function (node) {
    return vocapText(node).toLocaleLowerCase("de") === "lernliste";
  });

  if (!heading) return [];

  var nodes = [];
  var current = heading.nextElementSibling;
  while (current) {
    if (/^H[23]$/.test(current.tagName)) break;
    nodes.push(current);
    current = current.nextElementSibling;
  }

  return nodes
    .flatMap(function (node) { return Array.from(node.matches("li") ? [node] : node.querySelectorAll("li")); })
    .map(function (item) {
      var marks = Array.from(item.querySelectorAll("mark")).map(vocapText).filter(Boolean);
      var parsed = vocapSplitEntry(vocapText(item));
      if (!parsed) return null;
      if (marks.length) {
        parsed.front = vocapPlain(marks.join(" "));
      }
      return parsed;
    })
    .filter(Boolean);
}

function vocapSetup(root) {
  var button = root.querySelector(".vocap-start");
  var dialog = root.querySelector(".vocap-dialog");
  if (!button || !dialog || button.dataset.ready === "true") return;
  button.dataset.ready = "true";

  var state = { cards: [], index: 0, revealed: false };
  var progress = dialog.querySelector(".vocap-progress");
  var front = dialog.querySelector(".vocap-front");
  var reading = dialog.querySelector(".vocap-reading");
  var answer = dialog.querySelector(".vocap-answer");
  var back = dialog.querySelector(".vocap-back");
  var empty = dialog.querySelector(".vocap-empty");
  var card = dialog.querySelector(".vocap-card");
  var show = dialog.querySelector(".vocap-show");
  var next = dialog.querySelector(".vocap-next");
  var reset = dialog.querySelector(".vocap-reset");

  function render() {
    var current = state.cards[state.index];
    var done = state.cards.length > 0 && state.index >= state.cards.length;
    if (!current || done) {
      progress.textContent = state.cards.length ? "Fertig: " + state.cards.length + " Vokabeln" : "";
      card.hidden = !state.cards.length;
      empty.hidden = !!state.cards.length;
      if (state.cards.length) {
        front.textContent = "Fertig";
        reading.textContent = "";
        back.textContent = "Du bist einmal durch die Lernliste gegangen.";
        answer.hidden = false;
      }
      show.disabled = true;
      next.disabled = true;
      reset.disabled = !state.cards.length;
      return;
    }

    card.hidden = false;
    empty.hidden = true;
    progress.textContent = state.index + 1 + " / " + state.cards.length;
    front.textContent = current.front;
    reading.textContent = current.reading || "";
    back.textContent = current.back;
    answer.hidden = !state.revealed;
    show.disabled = state.revealed;
    next.disabled = false;
    reset.disabled = false;
  }

  button.addEventListener("click", function () {
    state.cards = vocapItems();
    state.index = 0;
    state.revealed = false;
    render();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  });

  show.addEventListener("click", function () {
    state.revealed = true;
    render();
  });

  next.addEventListener("click", function () {
    state.index += 1;
    state.revealed = false;
    render();
  });

  reset.addEventListener("click", function () {
    state.index = 0;
    state.revealed = false;
    render();
  });
}

function vocapInit() {
  document.querySelectorAll("[data-vocap-trainer]").forEach(vocapSetup);
}

vocapInit();
document.addEventListener("nav", vocapInit);
document.addEventListener("render", vocapInit);
`

  return Component
}
