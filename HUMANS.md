# Moritz' Tea Garden

Diese Datei beschreibt die menschenlesbare und maßgebliche Grundlage dieses Repositorys. Die ausführlicheren Arbeitsanweisungen für AI-Assistenten stehen in [AGENTS.md](AGENTS.md).

## Zweck

Dieses Projekt veröffentlicht bewusst ausgewählte Notizen aus Moritz' Obsidian-Vault als Quartz-Website. Obsidian ist die Schreibumgebung und die Quelle der Wahrheit; dieses Repository übersetzt die freigegebenen Inhalte in eine statische Website.

Die Website soll den Vault möglichst getreu wiedergeben. Das gilt besonders für:

- Veröffentlichungsstatus und öffentliche Inhalte
- Obsidian-Wikilinks und Zettelbeziehungen
- Base-Ansichten, Karten, Cover, Properties, Sortierung und Gruppierung
- eingebettete Bilder, PDFs, Video und Audio
- Gestaltung, Schrift und Navigation

Wenn die Website und Obsidian voneinander abweichen, soll grundsätzlich die Website-Implementierung korrigiert werden, nicht die Bedeutung der Obsidian-Notiz.

## Maßgebliche Quellen

Für Inhalte und gewünschtes Verhalten gilt folgende Reihenfolge:

1. aktuelle Anweisungen von Moritz,
2. Human-Notizen im Vault,
3. diese Datei,
4. die projektspezifische Dokumentation unter [`docs/customizations/`](docs/customizations/index.md),
5. Implementierung und Tests.

Human-Notizen sind menschenlesbar, wartbar und maßgeblich. Agent-Notizen dürfen zusätzliche technische Details enthalten, ihnen aber nicht widersprechen. Human-Notizen im Vault sollen von einem Agenten nur verändert werden, wenn Moritz dies ausdrücklich verlangt.

Der Vault liegt standardmäßig unter:

```txt
/Users/moritzvitt/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Notes
```

Quartz-bezogene Wünsche und Erklärungen liegen dort hauptsächlich unter `Quartz/`; allgemeine Zusammenarbeits- und Wartungsregeln unter `workspace/`.

## Veröffentlichung

Eine Notiz wird nur veröffentlicht, wenn sie ausdrücklich `publish: true` oder `dg-publish: true` trägt. Ein Draft oder ein explizit falscher Veröffentlichungswert schließt sie aus. Der gesamte Vault kann veröffentlichte Notizen enthalten; der Ordner allein entscheidet nicht darüber.

Bestehende öffentliche Pfade aus `Digital Garden/` sollen stabil bleiben. `Digital Garden/Digital Garden.md` ist die Startseite.

Generierte Inhalte unter `content/` und `public/` sind keine redaktionelle Quelle und sollen nicht von Hand gepflegt werden.

## Private lokale Medien

Private Dateipfade, Originaldateinamen, Untertitel und Transkripte dürfen nicht unbeabsichtigt veröffentlicht werden.

- Referenzierte Bilder aus `Pictures` dürfen für veröffentlichte Notizen kopiert werden.
- Video-, Audio- und Bilddateien aus `Movies` sollen lokal verfügbar sein, öffentlich aber nur undurchsichtige Aliasse zeigen.
- Die Alias-Zuordnung bleibt lokal und außerhalb von Git.
- SRT-/VTT-Dateien und Untertiteltext bleiben privat.
- Ein Player erscheint nur bei einer ausdrücklichen Einbettung im Markdown.

## Gestaltung und Bases

Obsidian ist die Quelle der Wahrheit für Base-Views. Kartenbreite, Cover-Property, Bildanpassung, Seitenverhältnis, sichtbare Properties, Sortierung und Gruppierung sollen von der jeweiligen `.base`-Datei übernommen werden. Die Regel gilt für eingebettete und direkt geöffnete Bases.

Fehlt ein Cover, soll kein grauer Platzhalter erscheinen. Vorhandene Cover sollen ohne sichtbare Spalte zwischen Bild und Kartenrand dargestellt werden.

Die Designabsicht ist eine ruhige, handschriftlich geprägte Tea-Garden-Oberfläche mit umschaltbarer Standardschrift. Die aktuelle Farbpalette und Plugin-Konfiguration in `quartz.config.yaml` bleiben maßgeblich für die technische Umsetzung.

## Dokumentation

Die projektspezifische Dokumentation beginnt unter [docs/customizations/index.md](docs/customizations/index.md). Sie beschreibt Architektur, Sync, Bases, lokale Medien, Plugins und Betrieb. Bei wesentlichen Änderungen soll diese Dokumentation zusammen mit dem Code aktualisiert werden.
