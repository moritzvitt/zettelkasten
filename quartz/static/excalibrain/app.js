let data;
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
  stage.innerHTML = `
    <g class="edges">${edges.map((e) => `<line class="edge ${relationClass[e.kind]}" x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" />`).join("")}</g>
    <g class="labels">${Object.entries(relationLabels).filter(([kind]) => (note.relations[kind] || []).length).map(([, v]) => `<text class="relation-label" x="${v[0]}" y="${v[1]}" text-anchor="middle">${v[2]}</text>`).join("")}</g>
    <g class="nodes">${nodes.map(nodeSvg).join("")}</g>
  `;
  for (const el of stage.querySelectorAll(".node")) {
    el.addEventListener("click", () => selectNote(el.dataset.id));
  }
}

function nodeSvg(node) {
  const cls = node.kind === "Center" ? "node center" : "node";
  const count = Object.values(node.relations || {}).reduce((sum, arr) => sum + arr.length, 0);
  const x = node.x - node.w / 2;
  const y = node.y - node.h / 2;
  return `<g class="${cls}" data-id="${esc(node.id)}" transform="translate(${x},${y})">
    <rect width="${node.w}" height="${node.h}"></rect>
    <text x="${node.w / 2}" y="${node.h / 2 + (node.kind === "Center" ? 8 : 5)}" text-anchor="middle">${esc(short(node.title, node.kind === "Center" ? 36 : 28))}</text>
    <circle class="port" cx="0" cy="${node.h / 2}" r="4"></circle>
    <circle class="port" cx="${node.w}" cy="${node.h / 2}" r="4"></circle>
    <circle class="port" cx="${node.w / 2}" cy="0" r="4"></circle>
    <circle class="port" cx="${node.w / 2}" cy="${node.h}" r="4"></circle>
    <text class="count" x="${node.w + 10}" y="${node.h / 2 + 4}">${count}</text>
    <circle class="ring" cx="${node.w / 2}" cy="${node.h + 16}" r="5"></circle>
  </g>`;
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
  suggestions.innerHTML = matches.map((note) => `<button class="${note.id === selectedId ? "active" : ""}" data-id="${esc(note.id)}">${esc(short(note.title, 44))}</button>`).join("");
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
