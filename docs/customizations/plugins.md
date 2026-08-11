---
title: Lokale Plugins
---

# Lokale Plugins

Die Plugin-Quellen liegen unter `plugins/`. `npm run build:plugins` baut die lokalen Pakete; `quartz.config.yaml` entscheidet unabhängig davon, ob ein Plugin aktiv ist. Ein gebauter Plugin-Ordner ist daher nicht automatisch Teil der Website.

## Selbst entwickelte Plugins

| Plugin                     | Typ                          | Aktiv | Zweck                                                                                                      |
| -------------------------- | ---------------------------- | ----- | ---------------------------------------------------------------------------------------------------------- |
| `bases-view-name-resolver` | Transformer + Page-Type-Hook | ja    | Exakte Base-View-Namen und Obsidian-getreue Kartenansichten für eingebettete und eigenständige Bases       |
| `local-media-player`       | Transformer + Emitter        | ja    | Private Medienaliase, lokale Symlinks, Player, Zeitlinks, Audio-Modus und Lernclips                        |
| `discord-spoilers`         | Transformer                  | ja    | Rendert `\|\|Spoiler\|\|` zugänglich als verdeckten, fokussierbaren Inhalt                                 |
| `svg-viewer`               | Transformer                  | ja    | Normalisiert SVG-Embeds, bereinigt eingebettetes SVG und löst interne Links über `brain-index.json` auf    |
| `pdf-viewer`               | Emitter + Browser-Runtime    | ja    | Interaktiver PDF.js-Viewer mit Seitennavigation, Zoom, Fokusansicht und mobiler Öffnung                    |
| `font-reset`               | Komponente                   | ja    | Toolbar-Schalter zwischen Handschrift-Theme und Standardschrift; Auswahl bleibt in `localStorage` erhalten |
| `structured-brain`         | Komponente                   | nein  | Strukturansicht für Parent-, Child-, Prev-, Next- und Friend-Beziehungen aus `brain-index.json`            |
| `vocap-trainer`            | Komponente                   | nein  | Einmalige Lernkartenansicht für Notizen mit `vocab-trainer` beziehungsweise passendem Plugin-Property      |
| `contribute`               | Komponente                   | nein  | Formulare für Korrekturen und Zetteleinreichungen sowie Repository-, ZIP- und Markdown-Links               |
| `explorer`                 | Komponente                   | nein  | Lokale Explorer-Variante; derzeit in der Konfiguration deaktiviert                                         |

### Bases View Name Resolver

Der Resolver wird vor dem Table-of-Contents-Transformer ausgeführt. Bei Einbettungen liest er die zugehörige `.base`-Datei, ordnet slugifizierte Fragmente dem echten View-Namen zu und passt die erzeugte Kartenstruktur an. Für eigenständige Bases registriert ein Page-Type-Hook die eigene Cards-Implementierung, bevor `bases-page` den Body rendert. Die fachlichen Details stehen unter [Obsidian Bases](bases.md).

Tests:

```sh
npm test --prefix plugins/bases-view-name-resolver
```

### Local Media Player

Das Plugin verarbeitet lokale und YouTube-Medien im HTML, verbindet Zeitlinks mit Playern und stellt das UI für Audio-Modus und Lernclips bereit. Als Emitter liest es `private/local-media-aliases.json` und erzeugt standardmäßig Symlinks statt Kopien. Details stehen unter [Lokale Medien](local-media.md).

Tests:

```sh
npm test --prefix plugins/local-media-player
```

### Discord Spoilers

Der Transformer erkennt einzeilige Discord-Syntax `\|\|Inhalt\|\|` sowohl vor als auch nach der Markdown-Verarbeitung. Code-, Pre-, Script- und Style-Bereiche werden nicht verändert. Spoiler lassen sich mit Maus oder Tastatur fokussieren und aufdecken.

Tests:

```sh
npm test --prefix plugins/discord-spoilers
```

### SVG Viewer

Normale SVG-`object`-Embeds werden in kompatible Bilder umgewandelt. Die Browser-Runtime entfernt Skripte und Event-Handler aus geladenem SVG, verarbeitet verschachtelte SVGs und übersetzt interne Links mithilfe von `quartz/static/brain-index.json`. Excalidraw-SVGs werden ausgelassen, weil dafür das Excalidraw-Plugin zuständig ist.

### PDF Viewer

Das Plugin liefert die benötigten PDF.js-Dateien nach `public/static/pdfjs/` aus und hydratisiert die vom Sync erzeugten PDF-Embeds. Es unterstützt Vorschau, Navigation, Zoom, Fokusmodus und einen separaten Link für kleine Displays.

## Lokal eingebundene Community-Plugins

Diese Ordner liegen ebenfalls unter `plugins/`, wurden aber nicht als projektspezifische Plugins neu entworfen:

| Plugin                       | Herkunft                                       | Aktiv | Zweck                                                                               |
| ---------------------------- | ---------------------------------------------- | ----- | ----------------------------------------------------------------------------------- |
| `graph`                      | `@quartz-community/graph`                      | ja    | Interaktiver lokaler Seitengraph; der globale Graph ist in den Optionen deaktiviert |
| `obsidian-plugin-excalidraw` | `@quartz-community/obsidian-plugin-excalidraw` | ja    | Rendert Obsidian-Excalidraw-Zeichnungen als interaktive SVG-Seiten                  |

`scripts/use-local-graph.mjs` legt für eine definierte Teilmenge der lokalen Ordner Symlinks unter `.quartz/plugins/` an. Direkt mit `source: ./plugins/...` konfigurierte Plugins werden zusätzlich über ihre lokalen Quellen geladen. `scripts/ensure-plugin-index.mjs` erzeugt einen Fallback-Index aus allen vorhandenen `.quartz/plugins/*/dist/index.js`.

## Aktivierung und Reihenfolge

Der maßgebliche Status steht ausschließlich in `quartz.config.yaml` unter `plugins`. Dort werden auch Optionen, Layoutposition und `order` festgelegt. Bei Transformern ist die Reihenfolge relevant: Die Spoiler-Transformation läuft bei 45, die Bases-Anpassung bei 49, der lokale Medienplayer bei 65, SVG bei 67 und PDF bei 68.

Nach Quellcodeänderungen genügt für einen Einzelbuild:

```sh
npm run build:plugins
npm run build
```

Bei einem laufenden Dev-Server ist ein Neustart zuverlässiger, weil bereits importierte Plugin-Module zwischengespeichert sein können.
