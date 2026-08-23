# Agent Instructions

Diese Anweisungen gelten für das gesamte Repository. Lies zuerst [HUMANS.md](HUMANS.md). Die Human-Datei und die Human-Notizen im Vault sind maßgeblich; diese Datei ergänzt sie um operative Arbeitsregeln.

## Autorität und Vault-Orientierung

Bei Widersprüchen gilt:

1. aktuelle Anweisung von Moritz,
2. relevante Human-Notiz im Vault,
3. `HUMANS.md`,
4. diese Datei,
5. `docs/customizations/`,
6. bestehende Implementierung und Tests.

Standardpfade:

```txt
Repository: /Users/moritzvitt/src/zettelkasten-website
Vault:      /Users/moritzvitt/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Notes
```

Vor Quartz-bezogenen Änderungen sind mindestens die einschlägigen Notizen unter `Vault/Quartz/` zu lesen. Bei allgemeinen Vault-Arbeiten beginnt die Orientierung mit:

1. `workspace/Humans-Agents Collaboration Rules.md`
2. `workspace/Humans Maintenance Rules.md`
3. `workspace/Agents Maintenance Rules.md`
4. `workspace/Humans Index.md`
5. `workspace/Agents index.md`

Human-Notizen niemals ohne ausdrückliche Anweisung verändern. Agent-Notizen dürfen Implementierungsdetails, Arbeitsabläufe und abgeleitetes Wissen enthalten, müssen aber mit der entsprechenden Human-Notiz übereinstimmen. Wenn eine große Änderung ausdrücklich auch eine Human-Notiz betrifft, sind dort alle vom Agenten vorgenommenen Änderungen kursiv zu kennzeichnen, wie im Vault festgelegt.

## Projektmodell

Obsidian ist die Quelle der Wahrheit. Änderungen an veröffentlichtem Inhalt, Frontmatter, Base-Definitionen oder redaktionellen Links gehören in den Vault. Änderungen an Übersetzung, Darstellung und Buildverhalten gehören in dieses Repository.

Der Hauptfluss ist:

```txt
Obsidian-Vault
  -> scripts/sync-zettel.mjs
  -> content/ + private Alias-Zuordnung + brain-index.json
  -> Quartz und Plugins
  -> public/
```

Nicht von Hand bearbeiten:

- `content/`: wird beim Sync neu erzeugt
- `public/`: Buildausgabe
- `quartz/static/brain-index.json`: wird aus Vault-Beziehungen erzeugt
- `.quartz/plugins/index.ts`: wird durch `scripts/ensure-plugin-index.mjs` erzeugt
- `plugins/*/dist/`: aus `plugins/*/src/` bauen, nicht direkt patchen

Ausnahmen nur dann, wenn Moritz ausdrücklich die generierte Ausgabe selbst zum Ziel macht.

## Veröffentlichungs- und Sync-Regeln

Die maßgebliche Implementierung liegt in `scripts/sync-zettel.mjs`.

- Veröffentliche nur Notizen mit `publish: true` oder `dg-publish: true`.
- Schließe `draft: true`, `publish: false` und `dg-publish: false` aus.
- Durchsuche den gesamten Vault, nicht nur `Digital Garden/`.
- Überspringe `.git`, `.obsidian`, `.trash` und `node_modules`.
- Erhalte historische Routen, indem bei Quellen unter `Digital Garden/` dieses Präfix öffentlich entfernt wird.
- Behandle `Digital Garden/Digital Garden.md` als Homepage. Die älteren Welcome-Dateien bleiben kompatibel.
- Ignoriere `custom-path` für die Routenerzeugung.
- Erhalte hierarchische Tags einschließlich ihrer Eltern.
- Übernimm direkte Frontmatter-Properties, die eine `.base`-View für `order`, `sort`, `groupBy`, `image`, Datum, Board, `columnSize` oder `summaries` benötigt. Veröffentliche nicht pauschal alle Properties.
- Halte Zettelbeziehungen in Properties beziehungsweise im etablierten strukturierten Format und erzeuge daraus den Brain-Index.

Umgebungsvariablen für isolierte Arbeit:

```txt
ZETTEL_SOURCE_ROOT
DIGITAL_GARDEN_ROOT
ZETTEL_PICTURES_ROOT
ZETTEL_MOVIES_ROOT
ZETTEL_TRANSCRIPTS_ROOT
```

## Lokale Medien und Datenschutz

Private Pfade und Namen dürfen weder im generierten Markdown noch in committed Dateien erscheinen.

- Bilder unter `Pictures` dürfen bei tatsächlicher Referenz nach `content/` kopiert werden.
- Unterstützte lokale Video-, Audio- und Bilddateien unter `Movies` erhalten undurchsichtige `/local-media/<hash>.<ext>`-Aliasse.
- Die echte Zuordnung liegt ausschließlich in `private/local-media-aliases.json`; `private/` bleibt von Git ausgeschlossen.
- `local-media-player` erzeugt lokal standardmäßig Symlinks unter `public/local-media/`, keine Medienkopien.
- Lokale Medien dürfen auf der öffentlichen Deployment-Umgebung bewusst fehlen.
- Entferne oder anonymisiere sichtbare Linknamen, wenn sie den privaten Originaldateinamen enthalten.
- Veröffentliche weder `captions` noch SRT/VTT-Dateien, Transkriptlinks, Untertiteltext oder private Dateipfade.
- Lernclips dürfen private Untertitel lokal auswerten, aber nur numerische Cue-/Clipdaten veröffentlichen. Standardfenster: zwei Sekunden Vorlauf, vier Sekunden Nachlauf.
- Füge keinen Player allein aufgrund von `media`-Frontmatter ein. Ein Player erfordert ein ausdrückliches Markdown-Embed.
- Zeitlinks steuern den passenden vorhandenen Player; bei mehreren passenden Medien ist der aktuell abspielende Player zu bevorzugen.

Details: `docs/customizations/local-media.md`.

## Obsidian Bases

Obsidian-Base-Dateien sind die maßgebliche View-Konfiguration. `bases-page` übernimmt das Grundrendering; `plugins/bases-view-name-resolver` ergänzt die Obsidian-getreue Darstellung.

Bei Änderungen sicherstellen:

- eingebettete und eigenständige `.base`-Seiten funktionieren,
- slugifizierte Embed-Fragmente werden zum exakten View-Namen aufgelöst,
- Cards übernehmen `cardSize`, `image`, `imageFit`, `imageAspectRatio`, `order`, `sort`, `groupBy` und Property-Anzeigenamen,
- das Title-Feld erscheint nicht doppelt,
- fehlende Cover erzeugen keinen grauen Platzhalter,
- vorhandene Cover liegen ohne sichtbare grüne Spalte am Kartenrand,
- Sortierung und Gruppierung greifen auf die synchronisierten Properties zu.

Das Plugin muss vor `table-of-contents` laufen. Nach Plugin-Änderungen den Dev-Server neu starten, weil importierte Module zwischengespeichert sein können.

Details: `docs/customizations/bases.md`.

## Inhaltstreue und Gestaltung

Die Website soll die in Obsidian freigegebenen Inhalte, Wikilinks, Zettelbeziehungen, Embeds und Properties möglichst getreu wiedergeben. Wenn die Website von Obsidian abweicht, zuerst die Website-Übersetzung diagnostizieren; nicht eigenmächtig die Bedeutung der Vault-Notiz ändern.

Erhalte die ruhige, handschriftlich geprägte Tea-Garden-Oberfläche. Die Standardschrift muss über `font-reset` weiterhin erreichbar sein. Für konkrete Farben, Typografie, Navigation und Layout ist die aktive Konfiguration in `quartz.config.yaml` maßgeblich; gewünschte Designänderungen stehen in den relevanten Human-Notizen unter `Quartz/Design & Development/`.

## Plugins

Lokale Plugin-Quellen liegen unter `plugins/`. Der Aktivierungsstatus wird ausschließlich aus `quartz.config.yaml` abgeleitet, nicht aus vorhandenen Ordnern oder dem Manifest-Default.

Selbst entwickelte und aktive Plugins:

- `bases-view-name-resolver`
- `local-media-player`
- `discord-spoilers`
- `svg-viewer`
- `pdf-viewer`
- `font-reset`

Selbst entwickelte, derzeit deaktivierte Komponenten:

- `structured-brain`
- `vocap-trainer`
- `contribute`
- `explorer`

Lokal eingebundene Community-Plugins:

- `graph`
- `obsidian-plugin-excalidraw`

Bei Plugin-Arbeit Quellcode unter `src/` ändern, den vorgesehenen Build ausführen und Aktivierung, Kategorie, Reihenfolge und Optionen in `quartz.config.yaml` prüfen. Vollständige Übersicht: `docs/customizations/plugins.md`.

## Arbeitsablauf

Arbeite in einem möglicherweise bereits veränderten Worktree. Bestehende Änderungen gehören Moritz, sofern nicht eindeutig anders bekannt. Keine fremden Änderungen zurücksetzen, überschreiben oder inhaltlich bereinigen.

Vor Änderungen:

1. relevante Human-Notizen im Vault lesen,
2. betroffene Implementierung, Konfiguration und Tests inspizieren,
3. generierte und maßgebliche Dateien unterscheiden,
4. bestehende Änderungen mit `git status --short` beachten.

Lokaler Entwicklungsstart:

```sh
npm run dev
```

Gezielte Befehle:

```sh
npm run sync-zettel
npm run build:plugins
npm run ensure-plugin-index
npm run build
```

Ein vollständiger `npm run build` synchronisiert den realen Vault und kann deshalb `content/` umfassend verändern. Für isolierte Regressionstests bevorzugt temporäre Vault-Roots über die `ZETTEL_*`-Variablen oder die bestehenden Test-Fixtures verwenden.

## Tests

Mindestens die zum geänderten Bereich passenden Tests ausführen:

```sh
node --test scripts/sync-folder-links.test.mjs
npm test --prefix plugins/bases-view-name-resolver
npm test --prefix plugins/local-media-player
npm test --prefix plugins/discord-spoilers
```

Repositoryweite statische Prüfung:

```sh
npm run check
```

Vor Abschluss einer risikoreichen Build-, Sync- oder Plugin-Änderung ist ein vollständiger Build sinnvoll, sofern das dabei entstehende Neu-Synchronisieren des realen Vaults im aktuellen Worktree vertretbar ist. Berichte klar, welche Prüfungen tatsächlich liefen und welche nicht.

## Dokumentationspflege

Die projektspezifische Dokumentation beginnt bei `docs/customizations/index.md`.

Bei Änderungen aktualisieren:

- Sync und Datenfluss: `architecture-and-sync.md`
- Bases: `bases.md`
- lokale Medien: `local-media.md`
- Plugins und Aktivierungsstatus: `plugins.md`
- Befehle und Fehlersuche: `operations.md`
- menschenrelevante Grundwahrheiten: `HUMANS.md`, aber nur bei ausdrücklicher Autorisierung oder wenn die konkrete Aufgabe dies verlangt

Dokumentiere den aktuellen Zustand, keine geplante Wunschfunktion als bereits umgesetzt. Verweise auf stabile Dateipfade und Befehle; vermeide schnell veraltende Zeilennummern.
