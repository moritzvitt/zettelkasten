---
title: Betrieb und Fehlersuche
---

# Betrieb und Fehlersuche

## Lokale Entwicklung

```sh
npm ci
npm run dev
```

`npm run dev` führt nacheinander aus:

1. alle lokalen Plugin-Builds,
2. die lokalen Plugin-Symlinks aus `scripts/use-local-graph.mjs`,
3. den Vault-Sync,
4. den Fallback-Plugin-Index,
5. `npx quartz build --serve`.

Die lokale Website läuft standardmäßig auf `http://localhost:8080`.

## Produktionsbuild

```sh
npm run build
```

Das `prebuild`-Skript baut zuvor die Plugins, richtet lokale Symlinks ein und stellt den Plugin-Index sicher. Der eigentliche Build synchronisiert anschließend den Vault und schreibt die Website nach `public/`.

Für eine andere Quelle:

```sh
ZETTEL_SOURCE_ROOT="/pfad/zum/vault" npm run build
```

Für isolierte Tests können `ZETTEL_PICTURES_ROOT`, `ZETTEL_MOVIES_ROOT` und `ZETTEL_TRANSCRIPTS_ROOT` gesetzt werden.

## Gezielt neu bauen

```sh
npm run sync-zettel
npm run build:plugins
npm run ensure-plugin-index
```

Ein einzelnes Plugin wird zum Beispiel so gebaut:

```sh
npm run build:bases-view-name-resolver
```

Die verfügbaren Plugin-Buildbefehle sind in `package.json` die maßgebliche Liste.

## Tests und Prüfungen

Die zentralen Regressionstests für die projektspezifische Logik sind:

```sh
node --test scripts/sync-folder-links.test.mjs
npm test --prefix plugins/bases-view-name-resolver
npm test --prefix plugins/local-media-player
npm test --prefix plugins/discord-spoilers
```

Eine umfassendere Repository-Prüfung läuft über:

```sh
npm run check
```

Vor einer Veröffentlichung sollte außerdem mindestens ein kompletter Build erfolgreich sein:

```sh
npm run build
```

## Typische Fehlerbilder

### Änderungen am Plugin erscheinen nicht

Das betroffene Plugin neu bauen und den Dev-Server neu starten. Quartz kann ein bereits importiertes Plugin-Modul weiterverwenden.

### Base-Properties fehlen

Prüfen, ob das Feld in `order`, `sort`, `groupBy`, `image`, einem Datums-/Board-Feld, `columnSize` oder `summaries` der `.base`-Datei vorkommt. Danach den Sync erneut ausführen und das erzeugte Frontmatter unter `content/` nur zur Diagnose ansehen.

### Base-View wird als „not found“ angezeigt

Prüfen, ob View-Name und Embed-Fragment zur selben `.base`-Datei gehören. Danach sicherstellen, dass `bases-view-name-resolver` aktiviert und vor `table-of-contents` eingeordnet ist.

### Lokales Medium oder Cover fehlt

Die Checkliste steht unter [Lokale Medien](local-media.md#fehlersuche). Besonders wichtig sind ein unterstütztes Format, ein Pfad innerhalb des konfigurierten Root-Verzeichnisses, ein aktuelles Alias-Manifest und ein gültiger Symlink im lokalen `public/`-Build.

### Öffentliche URL hat den falschen Pfad

Die Startseite und das historische Entfernen von `Digital Garden/` werden in `scripts/sync-zettel.mjs` festgelegt. `custom-path` aus Obsidian wird absichtlich nicht zur öffentlichen Routenerzeugung verwendet.

## Pflege dieser Dokumentation

Bei Änderungen an Sync, Plugin-Verhalten oder Buildbefehlen zuerst die Implementierung und Tests aktualisieren. Danach mindestens das betroffene Dokument unter `docs/customizations/` sowie gegebenenfalls `README.md` anpassen. Aktivierungsstatus niemals aus dem Ordnerbestand ableiten, sondern aus `quartz.config.yaml`.
