---
title: "Human Plugins Media Control"
source: "Quartz/plugins/Human Plugins Media Control.md"
publish: true
tags:
  - zettel
---
Ansonsten werden youtube Videos per iframe abgespielt. 

Media Extended für Quartz Funktionalitäten: 
- audio player soll funktionieren: 
- Media Extended Funktionalitäten generell sollten funktionieren
- Links in der Note sollten den aktiven player an die richtige timestamp setzen



Video Player

Der Ablauf ist:

1. Der Sync anonymisiert deinen Link:

```
![Lokales Video](/local-media/0c6b…mp4)
```

2. Quartz erkennt `.mp4` und wandelt das Markdown-Embed selbst in `<video controls>` um.
    
3. Der Media Player sucht nach einem vorhandenen `<video>`. Findet er eines, ergänzt er nur die Klasse `local-media-video`. Einen zusätzlichen Player fügt er nicht ein.
    
4. Nur wenn im Frontmatter ein auflösbares `media:` steht und noch kein `<video>` vorhanden ist, setzt er automatisch einen Player an den Seitenanfang.
    

Wichtiger Randfall: Steht das Video ausschließlich als Markdown-Embed in der Notiz, aber nicht zusätzlich im `media:`-Frontmatter, entsteht zwar das `<video>`-Element, aktuell wird dafür jedoch kein lokaler Symlink ausgegeben. Der Player hätte dann eine nicht erreichbare Alias-Adresse. Für zuverlässiges lokales Abspielen braucht die Notiz momentan also weiterhin:

```
media: "'s%20Moving%20Castle%20%282004%29.mp4"
```

Das Markdown-Embed ist dann optional; ohne Embed fügt der Media Player den Player automatisch ein.

---
aktuellster Stand: 
(moritz: bitte diese Notiz einmal zusammenfassen. Alles hierunter ist der aktuellste Stand)
- Kein automatisch eingefügter Player mehr. Ein Player erscheint nur bei einem expliziten Video-/Audio-Embed im Markdown.
- Zeitstempel-Links bleiben auf der aktuellen Seite und setzen den Player per `currentTime`.
- Bei mehreren passenden Playern wird nur der aktuell abspielende Video-/Audio-Player verändert.
- Lokale Medien verwenden weiterhin anonymisierte Aliasse; Originaldateinamen bleiben privat.
- Die gewünschte Notiz wurde aktualisiert: [Human Quartz Sync.md](/Users/moritzvitt/Notes/Obsidian Notes/Quartz/Human Quartz Sync.md)
- Dokumentation und Player-Code wurden entsprechend angepasst.
