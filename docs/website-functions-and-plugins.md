---
title: Website-Funktionen und Plugin-Zwecke
---

# Website-Funktionen und Plugin-Zwecke

Diese Datei beschreibt die aktuelle Website so, dass sie bei verlorenem Code konzeptionell nachgebaut werden kann. Sie erklärt nicht jede Codezeile, sondern den Zweck, die Eingaben, die Ausgaben und die wichtigsten Aufgaben der einzelnen Funktionen, Skripte und Plugins.

Stand: 2026-06-21. Grundlage sind `README.md`, `package.json`, `quartz.config.yaml`, `scripts/`, `quartz/plugins/loader/` und `plugins/`.

## Gesamtzweck

Die Website veröffentlicht ausgewählte Notizen aus einem Obsidian-Vault als statische Quartz-Website. Sie ist ein Digital Garden beziehungsweise Zettelkasten: Markdown-Dateien werden aus dem Vault synchronisiert, mit Frontmatter ergänzt, als HTML gerendert und durch Suchfunktion, Graph, Backlinks, Inhaltsverzeichnisse, Excalidraw/SVG-Ansichten und optionale Spezialkomponenten navigierbar gemacht.

Die zentrale Idee ist:

1. Obsidian bleibt die Schreibumgebung.
2. Nur bewusst veröffentlichte Notizen landen in `content/`.
3. Quartz baut daraus die Website in `public/`.
4. Plugins übernehmen Parsing, Layout, Navigation, Spezialmedien und Zusatzansichten.

## Datenfluss

1. `npm run dev` oder `npm run build` startet den Build.
2. `scripts/sync-zettel.mjs` liest den gesamten Obsidian-Vault.
3. Nur Notizen mit `publish: true` oder `dg-publish: true` werden übernommen.
4. Ausgeschlossene Notizen sind Notizen mit `draft: true`, `publish: false` oder `dg-publish: false`.
5. Der Sync schreibt veröffentlichte Notizen nach `content/`.
6. Wikilinks werden auf veröffentlichte Slugs umgeschrieben.
7. Eingebettete Bild/SVG-Assets werden neben die jeweilige Notiz kopiert.
8. Für Ordner ohne eigene Indexseite wird automatisch eine `index.md` mit Notizenliste erzeugt.
9. `quartz/static/brain-index.json` wird aus expliziten Zettel-Beziehungen erzeugt.
10. Quartz lädt `quartz.config.yaml`, installiert/aktiviert Plugins und rendert Seiten nach `public/`.

## Wichtige Verzeichnisse

- `content/`: generierter und teilweise vorhandener Markdown-/Asset-Inhalt, den Quartz rendert.
- `docs/`: Quartz-Dokumentation und projektbezogene Nachbaudokumentation.
- `plugins/`: lokale Plugin-Quellen und gebaute Plugin-Dateien.
- `.quartz/plugins/`: installierte oder per Symlink eingebundene Quartz-Plugins.
- `quartz/`: Quartz-Core, Loader, Komponenten, Page Types, Styles und Build-Pipeline.
- `quartz/static/brain-index.json`: statischer Strukturindex fuer Structured-Brain- und SVG-Link-Auflösung.

## Build- und Betriebsskripte

### `npm run dev`

Zweck: Lokale Entwicklung mit Server.

Aufgaben:

- baut lokale Plugins via `npm run build:plugins`,
- verlinkt lokale Plugin-Ordner in `.quartz/plugins/` via `scripts/use-local-graph.mjs`,
- synchronisiert Obsidian-Notizen via `scripts/sync-zettel.mjs`,
- erzeugt den Fallback-Plugin-Index via `scripts/ensure-plugin-index.mjs`,
- startet `npx quartz build --serve`.

### `npm run build`

Zweck: Produktionsbuild ohne Dev-Server.

Aufgaben:

- synchronisiert veröffentlichte Notizen,
- stellt den Plugin-Index sicher,
- baut Quartz nach `public/`.

Wichtig: `prebuild` baut lokale Plugins und verlinkt lokale Plugin-Versionen. Dadurch können lokale Plugin-Quellen die installierten Plugin-Versionen überschreiben.

### `scripts/sync-zettel.mjs`

Zweck: Brücke zwischen Obsidian-Vault und Quartz-Content.

Eingaben:

- Standardquelle: der gesamte Vault unter `/Users/moritzvitt/Notes/Obsidian Notes`
- Alternative Quelle: `ZETTEL_SOURCE_ROOT` oder `DIGITAL_GARDEN_ROOT`
- Externe Bilder: standardmäßig `/Users/moritzvitt/Pictures`, für Tests überschreibbar
  mit `ZETTEL_PICTURES_ROOT`
- Lokale Medien und private Transkripte: standardmäßig `/Users/moritzvitt/Movies` und
  `/Users/moritzvitt/Movies/Transkripte`, für Tests überschreibbar mit
  `ZETTEL_MOVIES_ROOT` und `ZETTEL_TRANSCRIPTS_ROOT`
- Markdown-Frontmatter der Notizen
- Obsidian-Wikilinks und eingebettete Assets

Wichtige Funktionen:

- `shouldPublish`: entscheidet, ob eine Notiz veröffentlicht wird.
- `outputPath`: erhält Vault-relative Ordner für neue Quellbereiche, entfernt aber
  bei Notizen unter `Digital Garden/` das historische Präfix, damit bestehende
  öffentliche URLs stabil bleiben.
- `titleFrom`: nimmt die erste H1 als Titel, sonst den Dateinamen.
- `rewriteWikiLinks`: ersetzt Wikilinks durch Slugs veröffentlichter Notizen.
- `rewriteExternalFileUrls`: kopiert referenzierte Bilder aus dem freigegebenen
  Pictures-Bereich in den Ordner der veröffentlichten Notiz und ersetzt lokale
  `file:///`-Bildpfade durch relative Webpfade.
- `publicFrontmatter`: entfernt `captions`, anonymisiert lokale Video-`file:///`-Werte als
  `/local-media/...`-Aliasse und entfernt sonstige lokale Dateipfade aus dem veröffentlichten
  Frontmatter.
- `parseLinksSection`: liest strukturierte Beziehungen aus einem Abschnitt `## Links`.
- `frontmatter`: schreibt ein neues Quartz-Frontmatter mit `title`, `source`, `publish`, `tags`, optionalen Aliases und `graphLinks`.
- `folderIndex`: erzeugt automatische Ordnerseiten.
- `buildBrainIndex`: erzeugt `brain-index.json` mit Nodes, expliziten Beziehungen, inversen Beziehungen und abgeleiteten Sibling-Kanten.

Ausgaben:

- `content/**/*.md`
- kopierte eingebettete Bilder/SVGs und referenzierte externe Bilder aus
  `/Users/moritzvitt/Pictures`
- automatische `content/**/index.md`
- `quartz/static/brain-index.json`
- private, von Git ausgeschlossene Zuordnung `private/local-media-aliases.json`

Der Sync durchsucht alle nicht-internen Vault-Ordner. `.git`, `.obsidian`,
`.trash` und `node_modules` werden ausgelassen. Ob eine Notiz veröffentlicht
wird, hängt vom Frontmatter ab und nicht von ihrem Quellordner.

Datenschutz- und Veröffentlichungsgrenze:

- SRT-/VTT-Dateien und `captions` werden nicht veröffentlicht.
- Lokale Filme und Videos werden nicht kopiert. Jeder verwendete Film erhält einen stabilen,
  aus seinem Pfad gehashten Alias unter `/local-media/...`; echte Pfade und Dateinamen werden
  aus dem veröffentlichten Markdown entfernt.
- Die Alias-Zuordnung wird nur lokal in `private/local-media-aliases.json` abgelegt. Dieser
  Ordner ist von Git ausgeschlossen. Transkriptlinks werden weiterhin neutralisiert.
- Diese Bereinigung betrifft nur `content/`; die Obsidian-Quelldateien bleiben
  unverändert.

### `scripts/relationship-parser.mjs`

Zweck: Extrahiert bewusst gesetzte Zettel-Beziehungen aus Markdown.

Erkannt werden im Abschnitt `## Links` diese Felder:

- `Parent:: [[...]]`
- `Child:: [[...]]`
- `Prev:: [[...]]`
- `Next:: [[...]]`
- `Friend:: [[...]]`

Die Beziehungstypen werden auf `parent`, `child`, `prev`, `next`, `friend` normalisiert. Inverse Beziehungen werden erzeugt, damit beispielsweise ein `Parent` automatisch auch als `child` in Gegenrichtung verstanden werden kann.

### `scripts/use-local-graph.mjs`

Zweck: Lokale Plugin-Entwicklung.

Das Skript legt Symlinks von `plugins/<name>` nach `.quartz/plugins/<name>` an. Aktuell berücksichtigt es:

- `explorer`
- `graph`
- `contribute`
- `structured-brain`
- `local-media-player`
- `discord-spoilers`
- `svg-viewer`

Hinweis: Das Skript verlinkt Plugins, aktiviert sie aber nicht automatisch in `quartz.config.yaml`.

### `scripts/ensure-plugin-index.mjs`

Zweck: Fallback-Index für lokal installierte Plugins.

Das Skript liest `.quartz/plugins/`, sucht Plugin-Ordner mit `dist/index.js` und schreibt `.quartz/plugins/index.ts`, der alle gefundenen Plugin-Entrypoints exportiert.

### `scripts/configure-site-url.mjs`

Zweck: CI-/Deploy-Hilfe.

Wenn `QUARTZ_BASE_URL` gesetzt ist, wird `configuration.baseUrl` in `quartz.config.yaml` auf diesen Wert gesetzt. Protokoll und trailing slash werden entfernt.

### `scripts/check-hidden-graph-links.mjs`

Zweck: Regressionstest für versteckte Graph-Beziehungen.

Das Skript prüft, ob Beziehungen aus Obsidian-Kommentarblöcken zwischen veröffentlichten Notizen auch im gebauten `public/static/contentIndex.json` auftauchen.

## Quartz-Konfiguration

Die zentrale Konfiguration liegt in `quartz.config.yaml`.

Wichtige globale Einstellungen:

- `pageTitle: Quartz 5`: aktueller Seitentitel.
- `enableSPA: true`: aktiviert clientseitige Navigation ohne vollständige Seitenreloads.
- `enablePopovers: true`: aktiviert Link-Popovers.
- `analytics.provider: plausible`: aktiviert Plausible-Analytics.
- `locale: en-US`: steuert Datums-/Lokalisierungslogik.
- `baseUrl: mysite.github.io`: Basis-URL für Sitemap/RSS/absolute URLs.
- `ignorePatterns`: ignoriert `private`, `templates`, `.obsidian`.
- `theme`: definiert Fonts und Farbwerte für Light/Dark Mode.

Das Layout wird pluginbasiert zusammengesetzt:

- linke Seitenleiste: Page Title, Search, Spacer, Darkmode, Reader Mode, Explorer
- rechte Seitenleiste: Graph, Table of Contents, Backlinks
- vor dem Artikel: Breadcrumbs, Article Title, Note Properties, Content Meta
- Footer: aktiv
- Ordner- und Tagseiten blenden Reader Mode aus und leeren die rechte Spalte.
- 404-Seiten blenden Sidebars und `beforeBody` aus.

## Plugin-Loader

Der Loader in `quartz/plugins/loader/config-loader.ts` ist die Schicht, die aus YAML echte Quartz-Plugins macht.

Aufgaben:

- liest `quartz.config.yaml` oder Legacy-Plugin-Dateien,
- installiert aktivierte Plugins in `.quartz/plugins/`,
- liest Manifeste bevorzugt aus `package.json > quartz`,
- validiert Plugin-Abhängigkeiten und Reihenfolge,
- sortiert Plugins nach Kategorie und `order`,
- lädt Komponenten, Frames, Transformer, Filter, Emitter und Page Types,
- kombiniert Community-/lokale Plugins mit eingebauten Quartz-Emittern,
- erzeugt am Ende den Page-Type-Dispatcher für das Layout.

Plugin-Kategorien:

- `transformer`: verändert Markdown/HTML-Daten während der Verarbeitung.
- `filter`: entscheidet, welche Dateien überhaupt weiterverarbeitet werden.
- `emitter`: erzeugt Dateien aus dem gesamten Content-Set.
- `pageType`: rendert bestimmte Seitentypen.
- `component`: stellt Layout-Komponenten bereit.

## Aktive Community- und Quartz-Plugins

Die folgenden Plugins sind in `quartz.config.yaml` aktiviert.

### `created-modified-date`

Zweck: Ermittelt Erstellungs- oder Änderungsdaten für Seiten.

Konfiguration:

- bevorzugt Frontmatter,
- danach Git,
- danach Dateisystem,
- Standarddatumstyp: `modified`.

### `syntax-highlighting`

Zweck: Hebt Codeblöcke hervor.

Konfiguration:

- Light Theme: `github-light`
- Dark Theme: `github-dark`
- Plugin behält den Theme-Hintergrund nicht bei.

### `obsidian-flavored-markdown`

Zweck: Macht Obsidian-Markdown im Web nutzbar.

Aktivierte Funktionen:

- Kommentare,
- Highlights,
- Wikilinks,
- Callouts,
- Mermaid,
- Tags,
- Pfeile,
- Blockreferenzen,
- YouTube- und Video-Embeds,
- Checkboxen.

### `github-flavored-markdown`

Zweck: Unterstützt gängige GitHub-Markdown-Syntax wie Tabellen, Task Lists und ähnliche GFM-Konventionen.

### `table-of-contents`

Zweck: Erzeugt ein Inhaltsverzeichnis der aktuellen Seite.

Layout:

- rechte Spalte,
- Priorität 30.

### `crawl-links`

Zweck: Durchsucht Seiten nach Links und baut daraus interne Linkbeziehungen für Graph, Backlinks, Popovers und Indexe.

Konfiguration:

- `markdownLinkResolution: shortest`, also möglichst kurze Linkauflösung.

### `description`

Zweck: Erzeugt Seitenbeschreibungen aus Inhalt oder Frontmatter. Diese werden für Meta-Tags, Vorschauen und Indexe genutzt.

### `latex`

Zweck: Rendert mathematische Ausdrücke.

Konfiguration:

- Render-Engine: KaTeX.

### `hard-line-breaks`

Zweck: Behandelt einfache Zeilenumbrüche im Markdown als sichtbare Zeilenumbrüche. Das passt eher zu Obsidian-Schreibgewohnheiten.

### `remove-draft`

Zweck: Entfernt Draft-Seiten aus dem Build. Es ist ein zusätzlicher Schutz neben dem eigenen Sync-Skript.

### `unlisted-pages`

Zweck: Ermöglicht Seiten, die existieren, aber aus Listen/Indexen ausgeblendet werden können.

### `encrypted-pages`

Zweck: Unterstützt verschlüsselte Seiten.

Konfiguration:

- Passwortfeld: `password`,
- Iterationen: `600000`,
- Indexdatei: `static/encryptedContentIndex.json`,
- verschlüsselte Seiten werden nicht automatisch unlisted gemacht.

### `alias-redirects`

Zweck: Erstellt Redirects für Aliases, damit alte oder alternative Seitennamen auf die eigentliche Seite verweisen.

### `content-index`

Zweck: Erzeugt maschinenlesbare Content-Indexe.

Konfiguration:

- Sitemap aktiv,
- RSS aktiv.

### `favicon`

Zweck: Bindet Favicons in die Seite ein.

### `og-image`

Zweck: Erzeugt oder bindet Open-Graph-Bilder für Linkvorschauen ein.

### `cname`

Zweck: Unterstützt Deployment mit Custom Domain, indem eine CNAME-Datei emittiert werden kann.

### `canvas-page`

Zweck: Rendert Obsidian-Canvas-Dateien als eigene Seitentypen.

### `content-page`

Zweck: Rendert normale Markdown-Notizen als Inhaltsseiten.

### `folder-page`

Zweck: Rendert Ordnerseiten.

### `tag-page`

Zweck: Rendert Tagseiten.

### `explorer`

Zweck: Dateibaum-/Navigationskomponente für die linke Spalte.

Layout:

- links,
- Priorität 50.

### `graph`

Zweck: Interaktive Graph-Visualisierung der Seitenverbindungen.

Layout:

- rechts,
- Priorität 10.

Lokale Besonderheit:

- `scripts/use-local-graph.mjs` kann das installierte Graph-Plugin durch `plugins/graph` ersetzen.

### `search`

Zweck: Volltextsuche über die Website.

Layout:

- links,
- Priorität 20,
- Gruppe `toolbar`,
- wächst innerhalb der Toolbar.

### `backlinks`

Zweck: Zeigt Seiten an, die auf die aktuelle Seite verlinken.

Layout:

- rechts,
- Priorität 50.

### `article-title`

Zweck: Zeigt den Artikeltitel vor dem Seiteninhalt.

Layout:

- `beforeBody`,
- Priorität 10.

### `content-meta`

Zweck: Zeigt Metadaten der Seite, insbesondere Datum/Lesedaten je nach Plugin-Konfiguration.

Layout:

- `beforeBody`,
- Priorität 20.

### `page-title`

Zweck: Zeigt den Website-/Seitentitel als Navigationselement.

Layout:

- links,
- Priorität 10.

### `darkmode`

Zweck: Umschalter zwischen Light und Dark Mode.

Layout:

- links,
- Priorität 30,
- Gruppe `toolbar`.

### `reader-mode`

Zweck: Lesemodus-Umschalter.

Layout:

- links,
- Priorität 35,
- Gruppe `toolbar`.

Für Ordner- und Tagseiten wird Reader Mode per `layout.byPageType` ausgeschlossen.

### `breadcrumbs`

Zweck: Zeigt Pfadnavigation oberhalb des Artikels.

Layout:

- `beforeBody`,
- Priorität 5,
- Bedingung `not-index`.

### `footer`

Zweck: Rendert Fußbereich.

Konfiguration:

- Links auf Quartz-GitHub und Quartz-Discord.

### `spacer`

Zweck: Layout-Abstandhalter für die mobile Toolbar.

Layout:

- links,
- Priorität 25,
- nur mobil,
- Gruppe `toolbar`.

### `bases-page`

Zweck: Rendert Obsidian-Bases-/Tabellenansichten als eigene Page Type.

### `note-properties`

Zweck: Zeigt ausgewählte Frontmatter-Properties an.

Konfiguration:

- `includeAll: false`,
- sichtbar sind `description`, `tags`, `aliases`,
- YAML-Delimiter `---`,
- Layout `beforeBody`, Priorität 15.

### `quartz-themes`

Zweck: Lädt Theme-Erweiterungen aus `saberzero1/quartz-themes`.

Konfiguration:

- Theme: `default`.

### `obsidian-plugin-excalidraw`

Zweck: Macht Excalidraw-Zeichnungen interaktiv beziehungsweise webtauglich. Das
Projekt verwendet einen lokalen Fork unter `plugins/obsidian-plugin-excalidraw`.
Er ergänzt die Community-Version um Unterstützung für Obsidian-Notizen, die in
Excalidraw als Bild statt als Embeddable eingefügt wurden: Die Zuordnung aus
`## Embedded Files` wird auf veröffentlichte Quartz-Seiten aufgelöst und deren
Inhalt beim Build als statisches SVG-Vorschaubild exportiert. Diese Vorschau
wird an der Position und Größe des ursprünglichen Bildelements als echtes
SVG-`image` gerendert. Ein normaler Klick öffnet den Zettel; per Rechtsklick
steht zusätzlich „Zum Zettel springen“ zur Verfügung. Nicht veröffentlichte
Referenzen erhalten eine entsprechend beschriftete, weiterhin verlinkte
Fallback-Vorschau.

Konfiguration:

- Interaktion aktiv,
- Dark Mode automatisch,
- Export-Padding 20.

Tests: `npm test --prefix plugins/obsidian-plugin-excalidraw`.

### `stacked-pages`

Typ: Component.

Zweck: Behält den Navigationspfad auf Desktop-Bildschirmen als vertikale
Seitenstapel am linken und rechten Rand sichtbar. Interne Links werden weiterhin
vom Quartz-SPA-Router geöffnet; besuchte Seiten werden während der Browser-Sitzung
als Tabs gespeichert und können erneut aufgerufen oder geschlossen werden.

Konfiguration:

- höchstens 8 Tabs,
- ab 800 Pixel Breite aktiv,
- Spines und Übergangsanimationen aktiviert,
- Position `afterBody` mit Priorität 50,
- auf mobilen Ansichten normale Navigation ohne Seitenstapel.

## Deaktivierte, aber konfigurierte Plugins

Diese Plugins stehen in `quartz.config.yaml`, sind aber aktuell deaktiviert:

- `citations`: Literatur-/Zitationsunterstützung.
- `ox-hugo`: Unterstützung für ox-hugo-kompatiblen Markdown-Export.
- `roam`: Roam-ähnliche Markdown-/Linkkonventionen.
- `explicit-publish`: könnte Veröffentlichung stärker über explizite Publish-Flags steuern; aktuell übernimmt das eigene Sync-Skript diese Aufgabe.
- `tag-list`: Tagliste oberhalb des Inhalts.
- `comments`: Kommentare, in der Config auf Giscus vorbereitet.
- `recent-notes`: Liste neuer oder geänderter Notizen.

## Lokale Eigenplugins

Die lokalen Plugins liegen in `plugins/`. Sie werden durch `npm run build:plugins` gebaut. Aktiv werden sie erst, wenn sie in `quartz.config.yaml` als Plugin eingetragen und enabled sind oder wenn eine gleichnamige Community-Plugin-Quelle lokal überschrieben wird.

### `plugins/graph`

Typ: Component.

Zweck: Interaktive Graph-Komponente für lokale und globale Seitenbeziehungen.

Aufgabe:

- visualisiert Seiten als Netzwerk,
- nutzt Linkdaten aus Quartz,
- unterstützt lokale und globale Graph-Konfigurationen,
- bietet Optionen für Dragging, Zoom, Tiefe, Skalierung, Kräfte, Linkdistanz, Tags, Hover-Fokus und Radiallayout.

Nachbau:

- Eine Quartz-Komponente `Graph` bereitstellen.
- Plugin-Manifest mit `category: component` und Component-Export `Graph`.
- Linkdaten aus Quartz oder Content-Index lesen.
- Lokalen Graph auf aktuelle Seite begrenzen, globalen Graph auf alle Seiten erweitern.

### `plugins/contribute`

Typ: Component.

Zweck: Erlaubt Besucherinnen und Besuchern, Korrekturen, Ergänzungen oder ganze Zettel einzureichen.

UI-Funktionen:

- Panel `Mitmachen`,
- Formular `Verbesserung vorschlagen`,
- Formular `Einen Zettel einreichen`,
- Netlify-Forms-Unterstützung via `data-netlify="true"`,
- Honeypot-Feld `bot-field`,
- versteckte Felder für Seitentitel und Seiten-URL,
- Datei-Upload für Markdown,
- Pflicht-Checkbox zur Rechtebestätigung,
- Links zu GitHub, ZIP und Markdown-Ordner.

Optionen:

- `repositoryUrl`
- `zipUrl`
- `markdownUrl`

Nachbau:

- Quartz-Komponente in Preact/JSX bauen.
- Formulare als statisches HTML ausgeben, damit Netlify sie erkennen kann.
- Aktuelle Seite über `fileData.frontmatter.title` und `fileData.slug` eintragen.

### `plugins/structured-brain`

Typ: Component.

Zweck: Strukturierte Zettelkasten-Karte rund um die aktuelle Notiz.

Dieses Plugin ist nicht einfach ein Force-Graph. Es zeigt die semantischen Beziehungen eines Zettels räumlich:

- `Parent` oberhalb,
- `Child` unterhalb,
- `Prev` links,
- `Next` rechts,
- `Friend` optional,
- inverse/abgeleitete Beziehungen schwächer,
- längere Prev/Next-Sequenzen in der großen Ansicht als Sequenzspalten.

Eingabe:

- `quartz/static/brain-index.json`, erzeugt durch `scripts/sync-zettel.mjs`.

UI-Funktionen:

- kleines Strukturpanel im Seiteninhalt,
- Friends-Toggle mit `localStorage`,
- Fullscreen-/Modalansicht,
- Pan/Zoom in der Modalansicht,
- klickbare Knoten,
- Tastaturnavigation mit Enter/Space,
- Tooltips bei kompakten Labels,
- automatische Ausblendung, wenn die aktuelle Seite keine Beziehungen hat.

Optionen:

- `height`, Standard 620,
- `minHeight`, Standard 260,
- `compactThreshold`, Standard 5.

Nachbau:

- Beim Laden `static/brain-index.json` fetchen.
- Aktuelle Seite aus `document.body.dataset.slug` oder URL bestimmen.
- Beziehungen nach Typ gruppieren.
- Zentrum als aktuelle Seite setzen.
- Knoten geometrisch um das Zentrum platzieren, nicht frei simulieren.
- SVG mit Linien, Pfeilen, Ports und klickbaren Knoten zeichnen.

### `plugins/local-media-player`

Typ: Transformer und Emitter.

Zweck: Verknüpft Notizen mit lokalen Video-/Mediendateien oder YouTube-Videos und macht Zeitmarken anklickbar.

Eingabe:

- Frontmatter-Feld `media`.
- Lokale Medienwurzel: `/Users/moritzvitt/Notes/Obsidian Notes/Digital Garden/media-lib/Media`.
- Standardroute: `/local-media`.
- Private Alias-Zuordnung: `private/local-media-aliases.json`.

Markdown-/HTML-Funktionen:

- erkennt `media` als Obsidian-Wikilink auf lokale Datei,
- erkennt YouTube-URLs,
- schreibt Zeitmarkenlinks wie `[[Video#t=123|Label]]` in echte Links um,
- markiert Zeitmarkenlinks mit `data-media-time` und fängt Klicks innerhalb der Seite ab,
- fügt niemals allein aufgrund des `media`-Frontmatters einen Player ein; ein Video- oder
  Audio-Player muss ausdrücklich als Embed im Markdown stehen,
- verweist lokale Mediendateien unter anonymisierten `/local-media/...`-Adressen,
- legt im lokalen Output standardmäßig Symlinks auf die unveränderten Originaldateien an; nur
  mit `copyMedia: true` werden Medien stattdessen kopiert,
- kann echte lokale Pfade nur über die von Git ausgeschlossene Alias-Datei auflösen; im
  GitHub-/CI-Build bleiben diese Medien deshalb absichtlich nicht verfügbar,
- verhindert Quartz-Router-Interferenz durch `data-router-ignore`.

Browser-Funktionen:

- Klick auf eine Zeitmarke öffnet keine neue Seite, sondern springt im passenden vorhandenen
  Player zur Sekunde,
- bei mehreren Playern für dasselbe Medium wird nur der gerade aktive Player gesteuert; ist
  nur ein passender Player vorhanden, wird dieser verwendet,
- YouTube wird via `postMessage` gesteuert,
- lokale Videos werden per `currentTime` gesteuert,
- `BroadcastChannel` synchronisiert Sprünge zwischen Tabs/Fenstern,
- URL-Hash `#t=<sekunden>` kann initialen Sprung auslösen.

Nachbau:

- Transformer für Markdown-Zeitmarken.
- HTML-Plugin zum Erkennen ausdrücklich eingebetteter Player und zum Markieren von Zeitlinks.
- Emitter zum lokalen Verlinken der Originalmedien über private Alias-Zuordnungen.
- Inline-JS für die aktive-Player-Auswahl und Seek-Logik bei Video, Audio und YouTube.

### `plugins/discord-spoilers`

Typ: Transformer.

Zweck: Unterstützt Discord-Spoiler-Syntax `||Text||` in Markdown.

Aufgaben:

- erkennt Spoiler in Textknoten,
- wandelt sie in `<span class="discord-spoiler">` um,
- ignoriert Code, Pre, Script und Style,
- escaped HTML im Spoilertext,
- macht Spoiler per Hover, Fokus oder Aktivierung sichtbar,
- setzt `tabindex`, `role="button"` und `aria-label`.

Nachbau:

- Remark-/Markdown-Plugin für frühe Textumwandlung.
- Rehype-/HTML-Plugin als Sicherheitsnetz nach HTML-Konvertierung.
- Inline-CSS für verborgenes und sichtbares Spoiler-Styling.

### `plugins/svg-viewer`

Typ: Transformer im Manifest, praktisch vor allem externe Ressourcen.

Zweck: Ersetzt eingebettete SVG-Objects im Artikel durch einen interaktiven Viewer.

Aufgaben:

- findet `object[type="image/svg+xml"]` in Artikeln,
- lädt das SVG per `fetch`,
- entfernt `<script>` und Event-Handler-Attribute,
- inline eingebettete SVG-Data-URLs,
- löst `<use>`-Verweise auf Symbole mit Links auf,
- liest `static/brain-index.json`, um interne SVG-Links auf Website-Slugs umzuschreiben,
- externe Links öffnen sicher mit `target="_blank"` und `rel="noopener noreferrer"`,
- nicht auflösbare interne Links werden deaktiviert und als unresolved markiert.

Viewer-Funktionen:

- Zoom per Mausrad und Buttons,
- Drag/Pan,
- Reset per Button oder Doppelklick,
- Fullscreen,
- Dark-Mode-Invertierung,
- mobile Mindesthöhen.

Nachbau:

- Clientseitiges Script bereitstellen.
- SVGs sanitizen.
- Linkindex aus `brain-index.json` aufbauen.
- Viewer-Container, Toolbar und ViewBox-basierte Pan/Zoom-Logik erzeugen.

### `plugins/explorer`

Typ: Component, aktuell nur als gebautes Paket vorhanden.

Zweck: Lokale oder angepasste Explorer-Komponente für die Seitennavigation.

Bekannt aus Manifest:

- Component-Export `Explorer`,
- Standardposition links,
- Priorität 50.

Nachbau:

- Baum aus Quartz-Datei-/Slugdaten erzeugen.
- Aktuellen Pfad hervorheben.
- Ordner ein-/ausklappbar machen.
- Als Quartz-Komponente exportieren.

## Homepage

Die Root-URL `/` ist eine reguläre Quartz-Inhaltsseite. Die veröffentlichte
Obsidian-Notiz `Digital Garden/Digital Garden.md` wird vom Sync als Homepage
erkannt und nach `content/index.md` geschrieben. Die früher verwendeten
Quelldateien `Digital Garden/Welcome in my Digital Garden!.md` und
`Digital Garden/Tea Garden/Welcome in my Digital Garden!.md` bleiben als
Kompatibilitätsfälle unterstützt. Die Homepage muss wie jede andere Notiz
`publish: true` oder `dg-publish: true` tragen. Quartz rendert sie nach
`public/index.html`; es gibt keinen separaten Homepage-Emitter.

## Strukturindex `brain-index.json`

Zweck: Gemeinsame Datenquelle für strukturierte Zettelbeziehungen.

Er enthält:

- `nodes`: Slug, Titel, Quelle, URL, Tags.
- `relationships`: explizite und inverse Beziehungen für Structured Brain.
- `edges`: explizite, inverse und abgeleitete Kanten.
- `explicitEdges`: nur die bewusst gesetzten Beziehungen.
- `relationTypes`: `parent`, `child`, `prev`, `next`, `friend`, `sibling`.

Die Beziehungen entstehen aus dem `## Links`-Abschnitt einer Notiz. Beispiel:

```md
## Links

Parent:: [[Übergeordnetes Thema]]
Child:: [[Unterthema]]
Prev:: [[Vorheriger Zettel]]
Next:: [[Nächster Zettel]]
Friend:: [[Verwandte Idee]]
```

## Veröffentlichung einer Notiz

Eine Notiz wird veröffentlicht, wenn ihr Frontmatter eines der folgenden Felder enthält:

```yaml
publish: true
```

oder:

```yaml
dg-publish: true
```

Eine Notiz wird nicht veröffentlicht, wenn eines dieser Felder gesetzt ist:

```yaml
draft: true
publish: false
dg-publish: false
```

## Nachbau-Minimum

Wenn die Website von null nachgebaut werden müsste, wäre die kleinste funktionale Version:

1. Node 22 und npm 10.9.2 verwenden.
2. Quartz 5 als statischen Generator einrichten.
3. `quartz.config.yaml` mit SPA, Popovers, Theme, Search, Graph, Backlinks, Explorer und Content-Index anlegen.
4. Ein Sync-Skript bauen, das Obsidian-Notizen nach Publish-Frontmatter filtert und nach `content/` schreibt.
5. Wikilinks in stabile Slugs auflösen.
6. `brain-index.json` aus `Parent`, `Child`, `Prev`, `Next`, `Friend` erzeugen.
7. Lokale Plugins je nach Bedarf nachbauen:
   - `structured-brain` für semantische Zettelkarte,
   - `local-media-player` für Medien/Zeitmarken,
   - `svg-viewer` für interaktive SVGs,
   - `discord-spoilers` für Spoiler,
   - `contribute` für Netlify-Formulare,
   - `graph`/`explorer` für Navigation.
8. `npm run build` so verkabeln, dass Sync, Plugin-Build und Quartz-Build zuverlässig in dieser Reihenfolge laufen.

## Wichtige Grenzen und offene Punkte

- Die lokalen Eigenplugins sind im Workspace vorhanden und werden gebaut, aber nicht alle sind im aktuellen `quartz.config.yaml` als aktive Plugin-Einträge sichtbar.
- `plugins/explorer` liegt nur als gebautes Paket vor; die ursprüngliche Quelle ist in diesem Workspace nicht sichtbar.
- Die Website hängt an absoluten lokalen Vault-Pfaden. Für einen portablen Nachbau sollten diese Pfade über Umgebungsvariablen oder eine eigene Config-Datei konfigurierbar gemacht werden.
- `public/` ist Build-Output und wird nicht committed.
