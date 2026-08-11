---
title: Lokale Medien
---

# Lokale Medien

Lokale Medien sollen beim lokalen Hosting verfügbar sein, ohne private Pfade oder Dateinamen in Git oder in der öffentlichen Website preiszugeben. Dafür trennt der Sync veröffentlichbaren Markdown-Inhalt von der lokalen Dateizuordnung.

## Zwei Arten lokaler Bilder

Bilder unter `/Users/moritzvitt/Pictures` werden nur dann nach `content/` kopiert, wenn eine veröffentlichte Notiz sie tatsächlich referenziert. Der Link wird auf einen relativen Webpfad umgeschrieben.

Dateien unter `/Users/moritzvitt/Movies` werden nicht kopiert. Das gilt für Video, Audio und dort liegende Bilder beziehungsweise Cover. Sie erhalten einen stabilen, undurchsichtigen Alias:

```txt
/local-media/<hash>.<erweiterung>
```

Der Alias enthält weder den Originalpfad noch den ursprünglichen Dateinamen. Auch der sichtbare Linktext wird ersetzt, wenn er den privaten Dateinamen verraten würde.

## Unterstützte Formate

- Video: `.mp4`, `.mov`, `.m4v`, `.webm`, `.ogv`
- Audio: `.mp3`, `.wav`, `.m4a`, `.ogg`, `.oga`, `.aac`, `.flac`
- Alias-Bilder: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`
- Direkt veröffentlichbare Vault-Assets: die genannten Bildformate sowie `.pdf`

## Alias-Ablauf

1. `scripts/sync-zettel.mjs` erkennt einen lokalen `file:///`-Link oder ein auflösbares Medien-Wikilink.
2. Aus dem normalisierten Quellpfad wird ein stabiler Alias gebildet.
3. Das veröffentlichte Markdown beziehungsweise Frontmatter enthält nur `/local-media/...`.
4. Die echte Zuordnung wird in `private/local-media-aliases.json` gespeichert. `private/` ist von Git ausgeschlossen.
5. Das Plugin `local-media-player` liest die Zuordnung beim lokalen Build und legt unter `public/local-media/` Symlinks auf die Originaldateien an.

In `quartz.config.yaml` ist `copyMedia` nicht aktiviert. Deshalb werden lokale Originale nicht in den Build kopiert. Auf einem anderen Rechner oder in einer öffentlichen Deployment-Umgebung fehlen die Symlink-Ziele absichtlich; dort sind diese Medien nicht verfügbar.

## Einbettung und Links

Ein Video- oder Audio-Player erscheint nur bei einer ausdrücklichen Einbettung im Markdown. Das Property `media` allein fügt keinen Player ein. Der Sync erzeugt je nach Dateityp `<video>`, `<audio>` oder `<img>`.

Normale Links behalten einen unkritischen Alias als sichtbaren Namen. Zeitlinks wie `#t=75.5` werden vom Plugin dem passenden Player zugeordnet und springen direkt zur Stelle. Externe Medien wie YouTube bleiben Web-URLs. YouTube-Einbettungen mit Audio-Modus werden als eigener Audio-Player dargestellt.

## Lernclips und Untertitel

`captions` und lokale SRT-/VTT-Dateien werden nie veröffentlicht. Bei Mediennotizen mit `## Lernliste` darf der Sync die private Untertiteldatei lokal lesen und daraus Zeitfenster ableiten. Veröffentlicht werden ausschließlich Zeiten und Eintragsnummern, nicht Untertiteltext oder privater Pfad.

Standardmäßig beginnen Lernclips zwei Sekunden vor dem Cue und enden vier Sekunden danach. Überlappende Fenster werden im Player zu einer Passage zusammengefasst. Die Bedienleiste bietet Navigation, Wiederholung, Hervorhebung des aktuellen Lernlisteneintrags und bei Videos einen Modus `Nur Audio`.

## Fehlersuche

Wenn ein lokales Cover oder Medium nicht erscheint:

1. Prüfen, ob die Datei innerhalb des konfigurierten `ZETTEL_MOVIES_ROOT` liegt und eine unterstützte Erweiterung hat.
2. `npm run sync-zettel` erneut ausführen.
3. In `private/local-media-aliases.json` prüfen, ob ein Alias erzeugt wurde, ohne den Inhalt dieser privaten Datei zu veröffentlichen.
4. Den lokalen Server neu starten und prüfen, ob unter `public/local-media/` ein gültiger Symlink liegt.
5. Bei Bases sicherstellen, dass die View `image: note.cover` oder das gewünschte Property verwendet.

Die Obsidian-Quelldateien werden durch diesen Vorgang nicht verändert.
