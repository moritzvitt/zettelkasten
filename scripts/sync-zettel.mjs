import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

const vaultRoot = "/Users/moritzvitt/Notes/Obsidian Notes"
const zettelRoot = path.join(vaultRoot, "LLM Wiki/notes/zettel")
const contentRoot = path.join(process.cwd(), "content")
const staticExcalibrainRoot = path.join(process.cwd(), "quartz/static/excalibrain")
const relationNames = ["Prev", "Next", "Parent", "Child", "Friend"]

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    if (entry.isFile() && entry.name.endsWith(".md")) files.push(full)
  }
  return files
}

function stripFrontmatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n?/, "")
}

function titleFrom(file, text) {
  const h1 = text.match(/^#\s+(.+)$/m)
  return (h1?.[1] || path.basename(file, ".md")).trim()
}

function cleanTitle(value) {
  return value
    .replace(/^LLM Wiki\/workspace\/bin\//, "")
    .replace(/^LLM Wiki\/notes\/zettel\//, "")
    .replace(/\.md$/, "")
    .split("/")
    .pop()
    .trim()
}

function wikiLinks(text) {
  const result = []
  const rx = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g
  for (const match of text.matchAll(rx)) result.push(cleanTitle(match[1]))
  return result
}

function relations(text) {
  const rels = Object.fromEntries(relationNames.map((name) => [name, []]))
  for (const name of relationNames) {
    const rx = new RegExp(`${name}::([^\\n%]*)`, "gi")
    for (const match of text.matchAll(rx)) rels[name].push(...wikiLinks(match[1]))
    rels[name] = [...new Set(rels[name].filter(Boolean))]
  }
  return rels
}

function allWikiLinks(text) {
  return [...new Set(wikiLinks(text))]
}

function excerpt(text) {
  return stripFrontmatter(text)
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || cleanTitle(target))
    .replace(/^#+\s+/gm, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !relationNames.some((name) => line.startsWith(`${name}::`)))
    .join(" ")
    .slice(0, 220)
}

function listLinks(ids, fallback = "Keine Einträge") {
  if (!ids.length) return fallback
  return ids.map((id) => `[[${id}]]`).join(", ")
}

function structureBlock(note) {
  return [
    "",
    "## Struktur",
    "",
    "Diese Ansicht wird beim Quartz-Sync aus den `Prev`/`Next`/`Parent`/`Child`/`Friend`-Feldern der Zettel erzeugt.",
    "",
    "| Previous | Parents | Children | Next | Friends |",
    "| --- | --- | --- | --- | --- |",
    `| ${listLinks(note.relations.Prev)} | ${listLinks(note.relations.Parent)} | ${listLinks(note.relations.Child)} | ${listLinks(note.relations.Next)} | ${listLinks(note.relations.Friend)} |`,
    "",
  ].join("\n")
}

function frontmatter(title, sourcePath) {
  return [
    "---",
    `title: "${title.replaceAll('"', '\\"')}"`,
    `source: "${sourcePath.replaceAll('"', '\\"')}"`,
    "tags:",
    "  - zettel",
    "---",
    "",
  ].join("\n")
}

function folderIndex(relDir, notes) {
  const title = relDir ? relDir.split(path.sep).at(-1) : "Zettelkasten"
  return [
    frontmatter(title, relDir || "LLM Wiki/notes/zettel"),
    `# ${title}`,
    "",
    relDir
      ? "Diese Seite sammelt die Zettel aus diesem Themenbereich."
      : "Dies ist die Quartz-Version des Zettelkastens aus `LLM Wiki/notes/zettel`.",
    "",
    "## Notizen",
    "",
    ...notes.map((note) => `- [[${note.title}]] - ${note.excerpt}`),
    "",
  ].join("\n")
}

function excalibrainPage(notes) {
  return [
    frontmatter("Excalibrain", "generated"),
    "# Excalibrain",
    "",
    '<iframe class="excalibrain-frame" src="static/excalibrain/index.html" title="Excalibrain Zettelkasten-Ansicht"></iframe>',
    "",
    '<a href="static/excalibrain/index.html">Excalibrain als eigene Seite öffnen</a>',
    "",
  ].join("\n")
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
}

function noteUrl(note) {
  const parts = note.rel
    .replace(/\.md$/, "")
    .split(path.sep)
    .map(slugify)
    .filter(Boolean)
  return `/${parts.join("/")}`
}

function excalibrainData(notes) {
  const items = notes.map((note) => ({
    id: note.title,
    title: note.title,
    url: noteUrl(note),
    folder: note.relDir,
    excerpt: note.excerpt,
    relations: note.relations,
  }))
  return {
    generatedAt: new Date().toISOString(),
    notes: items,
  }
}

function excalibrainHtml() {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Excalibrain</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <div class="app">
      <aside class="panel">
        <div class="brand">
          <span class="dot"></span>
          <div>
            <h1>Excalibrain</h1>
            <p>Fokussierte Strukturansicht deiner Zettel</p>
          </div>
        </div>
        <label class="search">
          <span>Zentralzettel</span>
          <input id="search" type="search" placeholder="Zettel suchen ..." autocomplete="off" />
        </label>
        <div id="suggestions" class="suggestions"></div>
        <div class="legend">
          <span><i class="prev"></i>Previous</span>
          <span><i class="parent"></i>Parents</span>
          <span><i class="child"></i>Children</span>
          <span><i class="next"></i>Next</span>
          <span><i class="friend"></i>Friends</span>
        </div>
        <p id="excerpt" class="excerpt"></p>
      </aside>
      <main class="stage-wrap">
        <div class="toolbar">
          <button id="open-note" type="button">Notiz öffnen</button>
          <button id="reset-view" type="button">Ansicht zentrieren</button>
        </div>
        <svg id="stage" class="stage" role="img" aria-label="Excalibrain Graph"></svg>
      </main>
    </div>
    <script src="./app.js"></script>
  </body>
</html>
`
}

function excalibrainCss() {
  return `:root {
  color-scheme: dark;
  --bg: #0f4771;
  --bg-deep: #0a385c;
  --panel: rgba(7, 28, 46, 0.78);
  --node: #082943;
  --node-soft: #103f63;
  --center: #d5d5d0;
  --text: #f8fafc;
  --muted: #b7c7d5;
  --line: rgba(255,255,255,0.34);
  --prev: #d8b4fe;
  --parent: #fde68a;
  --child: #99f6e4;
  --next: #fed7aa;
  --friend: #fda4af;
}

* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; background: var(--bg); color: var(--text); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }
body { background: radial-gradient(circle at 54% 46%, #15527c 0, var(--bg) 42%, var(--bg-deep) 100%); }
.app { height: 100vh; display: grid; grid-template-columns: 320px 1fr; }
.panel { position: relative; z-index: 3; padding: 22px; background: linear-gradient(180deg, rgba(4,21,36,.92), rgba(5,31,52,.72)); border-right: 1px solid rgba(255,255,255,.12); box-shadow: 18px 0 44px rgba(0,0,0,.18); overflow: auto; }
.brand { display: flex; gap: 12px; align-items: center; margin-bottom: 24px; }
.dot { width: 13px; height: 13px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 6px rgba(255,255,255,.12); }
h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
p { margin: 0; }
.brand p, .search span, .excerpt { color: var(--muted); font-family: system-ui, sans-serif; }
.search { display: grid; gap: 8px; margin-bottom: 14px; }
.search input { width: 100%; border: 1px solid rgba(255,255,255,.22); border-radius: 8px; background: rgba(255,255,255,.1); color: white; padding: 11px 12px; outline: none; font: inherit; }
.search input:focus { border-color: #fff; box-shadow: 0 0 0 3px rgba(255,255,255,.14); }
.suggestions { display: grid; gap: 6px; max-height: 240px; overflow: auto; padding-right: 4px; }
.suggestions button, .toolbar button { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.08); color: white; border-radius: 7px; padding: 8px 10px; text-align: left; cursor: pointer; font: inherit; }
.suggestions button:hover, .suggestions button.active, .toolbar button:hover { background: rgba(255,255,255,.18); }
.legend { margin: 22px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 9px; color: var(--muted); font-size: 13px; }
.legend span { display: flex; align-items: center; gap: 7px; }
.legend i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.legend .prev { background: var(--prev); }
.legend .parent { background: var(--parent); }
.legend .child { background: var(--child); }
.legend .next { background: var(--next); }
.legend .friend { background: var(--friend); }
.excerpt { line-height: 1.45; font-size: 14px; }
.stage-wrap { position: relative; min-width: 0; }
.toolbar { position: absolute; top: 18px; right: 18px; z-index: 2; display: flex; gap: 8px; }
.toolbar button { text-align: center; backdrop-filter: blur(12px); }
.stage { width: 100%; height: 100%; display: block; cursor: grab; }
.stage:active { cursor: grabbing; }
.edge { stroke: var(--line); stroke-width: 1.1; }
.edge.prev { stroke: var(--prev); }
.edge.parent { stroke: var(--parent); }
.edge.child { stroke: var(--child); }
.edge.next { stroke: var(--next); }
.edge.friend { stroke: var(--friend); }
.node rect { fill: var(--node); rx: 8px; filter: drop-shadow(0 12px 18px rgba(0,0,0,.2)); }
.node text { fill: white; font-size: 15px; font-weight: 750; letter-spacing: 0; pointer-events: none; }
.node.center rect { fill: var(--center); }
.node.center text { fill: #101010; font-size: 22px; }
.node .port { fill: white; stroke: white; stroke-width: 1; }
.node .count { fill: white; font-size: 10px; font-weight: 800; }
.node .ring { fill: transparent; stroke: rgba(255,255,255,.78); stroke-width: 1; }
.node:hover rect { fill: #0b3657; }
.node.center:hover rect { fill: #eeeeea; }
.relation-label { fill: rgba(255,255,255,.7); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-family: system-ui, sans-serif; }
@media (max-width: 860px) {
  .app { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .panel { max-height: 260px; border-right: 0; border-bottom: 1px solid rgba(255,255,255,.12); }
}
`
}

function excalibrainJs() {
  return `let data;
let selectedId;
const stage = document.getElementById("stage");
const search = document.getElementById("search");
const suggestions = document.getElementById("suggestions");
const excerpt = document.getElementById("excerpt");
const openNote = document.getElementById("open-note");
const resetView = document.getElementById("reset-view");
const relationOrder = ["Parent", "Prev", "Child", "Next", "Friend"];
const relationClass = { Parent: "parent", Prev: "prev", Child: "child", Next: "next", Friend: "friend" };
let view = { x: 0, y: 0, scale: 1 };
let dragging = null;

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const short = (value, n = 30) => value.length > n ? value.slice(0, n - 1) + "…" : value;
const noteById = () => new Map(data.notes.map((note) => [note.id, note]));

function relationNodes(note) {
  const byId = noteById();
  const nodes = [];
  for (const kind of relationOrder) {
    for (const id of note.relations[kind] || []) {
      const target = byId.get(id);
      if (target && target.id !== note.id) nodes.push({ ...target, kind });
    }
  }
  return nodes;
}

function layout(note) {
  const width = stage.clientWidth || 1200;
  const height = stage.clientHeight || 760;
  const cx = width / 2 + view.x;
  const cy = height / 2 + view.y;
  const related = relationNodes(note);
  const buckets = Object.fromEntries(relationOrder.map((kind) => [kind, related.filter((n) => n.kind === kind)]));
  const placed = [{ ...note, kind: "Center", x: cx, y: cy, w: Math.min(460, Math.max(260, note.title.length * 11)), h: 44 }];
  const placeRow = (kind, y, spread, offset = 0) => {
    const arr = buckets[kind];
    const count = arr.length;
    arr.forEach((node, i) => {
      const x = cx + (i - (count - 1) / 2) * spread + offset;
      placed.push({ ...node, x, y, w: Math.min(330, Math.max(210, node.title.length * 9)), h: 34 });
    });
  };
  placeRow("Parent", cy - 210, 330);
  placeRow("Prev", cy - 25, 300, -430);
  placeRow("Child", cy + 205, 300);
  placeRow("Next", cy - 25, 300, 430);
  const friends = buckets.Friend;
  friends.forEach((node, i) => {
    const angle = Math.PI * (0.18 + (i + 1) / (friends.length + 1) * 0.64);
    placed.push({
      ...node,
      x: cx + Math.cos(angle) * 520,
      y: cy + Math.sin(angle) * 300 + 70,
      w: Math.min(330, Math.max(210, node.title.length * 9)),
      h: 34,
    });
  });
  return placed.map((n) => ({ ...n, x: (n.x - cx) * view.scale + cx, y: (n.y - cy) * view.scale + cy, w: n.w * view.scale, h: n.h * view.scale }));
}

function edgeFor(center, node) {
  return {
    x1: center.x,
    y1: center.y + center.h / 2,
    x2: node.x,
    y2: node.y + node.h / 2,
    kind: node.kind,
  };
}

function render() {
  const byId = noteById();
  const note = byId.get(selectedId) || data.notes[0];
  selectedId = note.id;
  search.value = note.title;
  excerpt.textContent = note.excerpt || note.folder || "";
  const nodes = layout(note);
  const center = nodes.find((n) => n.kind === "Center");
  const edges = nodes.filter((n) => n.kind !== "Center").map((n) => edgeFor(center, n));
  const relationLabels = {
    Parent: [center.x, center.y - 250, "Parents"],
    Prev: [center.x - 600, center.y - 70, "Previous"],
    Child: [center.x, center.y + 265, "Children"],
    Next: [center.x + 600, center.y - 70, "Next"],
    Friend: [center.x, center.y + 410, "Friends"],
  };
  stage.innerHTML = \`
    <g class="edges">\${edges.map((e) => \`<line class="edge \${relationClass[e.kind]}" x1="\${e.x1}" y1="\${e.y1}" x2="\${e.x2}" y2="\${e.y2}" />\`).join("")}</g>
    <g class="labels">\${Object.entries(relationLabels).filter(([kind]) => (note.relations[kind] || []).length).map(([, v]) => \`<text class="relation-label" x="\${v[0]}" y="\${v[1]}" text-anchor="middle">\${v[2]}</text>\`).join("")}</g>
    <g class="nodes">\${nodes.map(nodeSvg).join("")}</g>
  \`;
  for (const el of stage.querySelectorAll(".node")) {
    el.addEventListener("click", () => selectNote(el.dataset.id));
  }
}

function nodeSvg(node) {
  const cls = node.kind === "Center" ? "node center" : "node";
  const count = Object.values(node.relations || {}).reduce((sum, arr) => sum + arr.length, 0);
  const x = node.x - node.w / 2;
  const y = node.y - node.h / 2;
  return \`<g class="\${cls}" data-id="\${esc(node.id)}" transform="translate(\${x},\${y})">
    <rect width="\${node.w}" height="\${node.h}"></rect>
    <text x="\${node.w / 2}" y="\${node.h / 2 + (node.kind === "Center" ? 8 : 5)}" text-anchor="middle">\${esc(short(node.title, node.kind === "Center" ? 36 : 28))}</text>
    <circle class="port" cx="0" cy="\${node.h / 2}" r="4"></circle>
    <circle class="port" cx="\${node.w}" cy="\${node.h / 2}" r="4"></circle>
    <circle class="port" cx="\${node.w / 2}" cy="0" r="4"></circle>
    <circle class="port" cx="\${node.w / 2}" cy="\${node.h}" r="4"></circle>
    <text class="count" x="\${node.w + 10}" y="\${node.h / 2 + 4}">\${count}</text>
    <circle class="ring" cx="\${node.w / 2}" cy="\${node.h + 16}" r="5"></circle>
  </g>\`;
}

function selectNote(id) {
  selectedId = id;
  const url = new URL(location.href);
  url.searchParams.set("note", id);
  history.replaceState(null, "", url);
  renderSuggestions("");
  render();
}

function renderSuggestions(query) {
  const q = query.trim().toLocaleLowerCase("de");
  const matches = data.notes
    .filter((note) => !q || note.title.toLocaleLowerCase("de").includes(q) || note.folder.toLocaleLowerCase("de").includes(q))
    .slice(0, 12);
  suggestions.innerHTML = matches.map((note) => \`<button class="\${note.id === selectedId ? "active" : ""}" data-id="\${esc(note.id)}">\${esc(short(note.title, 44))}</button>\`).join("");
  for (const button of suggestions.querySelectorAll("button")) button.addEventListener("click", () => selectNote(button.dataset.id));
}

search.addEventListener("input", () => renderSuggestions(search.value));
openNote.addEventListener("click", () => {
  const note = noteById().get(selectedId);
  if (note) window.top.location.href = note.url;
});
resetView.addEventListener("click", () => { view = { x: 0, y: 0, scale: 1 }; render(); });
stage.addEventListener("wheel", (event) => {
  event.preventDefault();
  const factor = event.deltaY > 0 ? 0.92 : 1.08;
  view.scale = Math.max(0.45, Math.min(2.2, view.scale * factor));
  render();
}, { passive: false });
stage.addEventListener("pointerdown", (event) => { dragging = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y }; stage.setPointerCapture(event.pointerId); });
stage.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  view.x = dragging.vx + event.clientX - dragging.x;
  view.y = dragging.vy + event.clientY - dragging.y;
  render();
});
stage.addEventListener("pointerup", () => { dragging = null; });
addEventListener("resize", render);

fetch("./graph-data.json").then((res) => res.json()).then((json) => {
  data = json;
  selectedId = new URL(location.href).searchParams.get("note") || "Anki alleine wird mit wachsendem Wortschatz ineffizient";
  if (!noteById().has(selectedId)) selectedId = data.notes[0].id;
  renderSuggestions("");
  render();
});
`
}

await rm(contentRoot, { recursive: true, force: true })
await mkdir(contentRoot, { recursive: true })
await mkdir(staticExcalibrainRoot, { recursive: true })

const files = await walk(zettelRoot)
const rawNotes = []
for (const file of files) {
  const text = await readFile(file, "utf8")
  const rel = path.relative(zettelRoot, file)
  rawNotes.push({
    file,
    rel,
    relDir: path.dirname(rel) === "." ? "" : path.dirname(rel),
    title: titleFrom(file, text),
    text,
    relations: relations(text),
    wikiLinks: allWikiLinks(text),
    excerpt: excerpt(text),
  })
}

const titleToTitle = new Map(rawNotes.map((note) => [cleanTitle(note.title), note.title]))
const stemToTitle = new Map(rawNotes.map((note) => [cleanTitle(path.basename(note.rel, ".md")), note.title]))
const resolve = (target) => titleToTitle.get(cleanTitle(target)) || stemToTitle.get(cleanTitle(target)) || null

for (const note of rawNotes) {
  for (const name of relationNames) note.relations[name] = [...new Set(note.relations[name].map(resolve).filter(Boolean))]
  note.wikiLinks = [...new Set(note.wikiLinks.map(resolve).filter(Boolean))]
}

for (const note of rawNotes) {
  const out = path.join(contentRoot, note.rel)
  await mkdir(path.dirname(out), { recursive: true })
  const body = stripFrontmatter(note.text)
  const sourcePath = path.relative(vaultRoot, note.file)
  await writeFile(out, frontmatter(note.title, sourcePath) + body.trim() + "\n" + structureBlock(note))
}

const folders = new Map()
for (const note of rawNotes) {
  if (!folders.has(note.relDir)) folders.set(note.relDir, [])
  folders.get(note.relDir).push(note)
}

await writeFile(
  path.join(contentRoot, "index.md"),
  folderIndex("", rawNotes.sort((a, b) => a.title.localeCompare(b.title, "de"))).replace("# Zettelkasten", "# Zettelkasten\n\n- [[Excalibrain]]"),
)

for (const [relDir, notes] of folders) {
  if (!relDir) continue
  const out = path.join(contentRoot, relDir, "index.md")
  await mkdir(path.dirname(out), { recursive: true })
  await writeFile(out, folderIndex(relDir, notes.sort((a, b) => a.title.localeCompare(b.title, "de"))))
}

await writeFile(
  path.join(contentRoot, "Excalibrain.md"),
  excalibrainPage(rawNotes.sort((a, b) => a.title.localeCompare(b.title, "de"))),
)

await writeFile(path.join(staticExcalibrainRoot, "index.html"), excalibrainHtml())
await writeFile(path.join(staticExcalibrainRoot, "style.css"), excalibrainCss())
await writeFile(path.join(staticExcalibrainRoot, "app.js"), excalibrainJs())
await writeFile(
  path.join(staticExcalibrainRoot, "graph-data.json"),
  `${JSON.stringify(excalibrainData(rawNotes), null, 2)}\n`,
)

console.log(`Synced ${rawNotes.length} zettel notes into ${contentRoot}`)
