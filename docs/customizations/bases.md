---
title: Obsidian Bases
---

# Obsidian Bases

Obsidian ist auch für Bases die Quelle der Wahrheit. Die `.base`-Dateien werden beim Sync unverändert und mit ihrem relativen Pfad nach `content/` übernommen. Quartz rendert sie mit dem Community-Plugin `bases-page`; das lokale Plugin `bases-view-name-resolver` gleicht die Darstellung an Obsidian an.

## Unterstützte Aufrufe

Die Anpassung gilt für beide Formen:

- eingebettete Base-Ansichten in einer Markdown-Notiz
- direkt geöffnete, eigenständige `.base`-Seiten

Bei Einbettungen löst das Plugin slugifizierte Fragmente wie `#all-published-files` wieder auf den exakten View-Namen aus der Base auf, zum Beispiel `all published files`. Bei eigenständigen Bases registriert es vor dem Rendern eine eigene Cards-Ansicht. Dieser zweite Codepfad ist notwendig, weil der normale Seitenkörper erst nach den üblichen HTML-Transformationen gerendert wird.

## Übernommene View-Einstellungen

Für Kartenansichten werden aus der ausgewählten Obsidian-View übernommen:

- `cardSize`
- `image`, zum Beispiel `note.cover`
- `imageFit` (`cover` oder `contain`)
- `imageAspectRatio`
- `order` und die sichtbaren Property-Zeilen
- `sort`
- `groupBy`
- Anzeigenamen aus dem `properties`-Abschnitt

`imageAspectRatio` wird für CSS invertiert, weil Obsidian das Verhältnis anders ausdrückt als die CSS-Eigenschaft `aspect-ratio`.

Damit Sortierung, Gruppierung und Property-Zeilen funktionieren, veröffentlicht der Sync automatisch die in Bases referenzierten direkten Frontmatter-Felder. Details stehen unter [Architektur und Synchronisierung](architecture-and-sync.md#frontmatter-und-base-properties).

## Karten und Cover

Die Kartenbreite entspricht `cardSize`; das Raster füllt die verfügbare Breite mit Karten genau dieser Größe. Titel werden in einer Zeile mit Ellipse abgeschnitten.

Für Cover gelten folgende Regeln:

- Ohne Cover wird kein grauer Platzhalter erzeugt.
- Das Bild liegt direkt am Kartenrand und wird von der abgerundeten Kartenkontur abgeschnitten.
- Der Bildcontainer überdeckt den ein Pixel breiten Kartenrahmen, damit zwischen Bild und Rand keine grüne Spalte sichtbar bleibt.
- `cover`-Bilder können Vault-Assets, freigegebene Bilder aus `Pictures` oder lokale Alias-Bilder aus `Movies` sein.

Das Title-Feld wird nicht ein zweites Mal als Property-Zeile ausgegeben. Andere in `order` genannte, vorhandene Werte erscheinen unter dem Titel.

## Grenzen

Die Anpassung konzentriert sich auf Obsidian-`cards`-Views. Andere View-Typen werden vom `bases-page`-Plugin gerendert. Komplexe Obsidian-Formeln können nur dargestellt werden, soweit das Community-Plugin sie auswertet. Direkte Notiz-Properties werden unterstützt; virtuelle `file.*`- und `formula.*`-Felder werden nicht als normales Frontmatter dupliziert.

Nach Änderungen am Plugin muss der lokale Entwicklungsserver neu gestartet werden, damit Quartz nicht weiter ein bereits geladenes Plugin-Modul verwendet.
