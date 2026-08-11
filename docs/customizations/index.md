---
title: Projektanpassungen
---

# Projektanpassungen

Diese Dokumentation beschreibt die projektspezifischen Erweiterungen von Moritz' Tea Garden. Sie ergänzt die allgemeine Quartz-Dokumentation unter `docs/` und orientiert sich am tatsächlichen Stand von Quellcode, Konfiguration und Tests.

Stand: 2026-08-05.

## Grundsatz

Obsidian ist die Quelle der Wahrheit. Veröffentlichungsstatus, Base-Definitionen, Kartenlayout, Sortierung, Gruppierung, Properties, Cover und Links werden im Vault gepflegt. Der Website-Code soll diese Angaben übernehmen und nur dort ergänzen, wo Quartz oder ein Browser eine Übersetzung benötigen.

Generierte Dateien unter `content/`, `public/` und `quartz/static/brain-index.json` werden nicht von Hand gepflegt. Änderungen gehören in den Vault, in `scripts/sync-zettel.mjs`, in `quartz.config.yaml` oder in ein Plugin unter `plugins/`.

## Dokumente

- [Architektur und Synchronisierung](architecture-and-sync.md): Datenfluss, Veröffentlichungsregeln, Pfade, Properties und generierte Artefakte
- [Obsidian Bases](bases.md): Übernahme von Base-Ansichten, Kartenoptionen, Cover, Sortierung und Gruppierung
- [Lokale Medien](local-media.md): private Dateien, Alias-System, lokale Wiedergabe und Lernclips
- [Lokale Plugins](plugins.md): selbst entwickelte Plugins, lokale Community-Plugins und Aktivierungsstatus
- [Betrieb und Fehlersuche](operations.md): Entwicklung, Build, Tests und typische Fehlerbilder

## Schnellstart

```sh
npm run dev
```

Der Befehl baut die lokalen Plugins, synchronisiert den Vault und startet Quartz mit lokalem Server. Ein Produktionsbuild ohne Server läuft über:

```sh
npm run build
```

Die wichtigste Konfiguration liegt in `quartz.config.yaml`. Die Synchronisierung wird von `scripts/sync-zettel.mjs` ausgeführt.
