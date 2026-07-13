---
title: "Plugins Media Control"
source: "Digital Garden/Tea Garden/foundation/Design & Development/plugins/Plugins Media Control.md"
publish: true
tags:
  - zettel
---
Ansonsten werden youtube Videos per iframe abgespielt. 

Media Extended für Quartz Funktionalitäten: 
- audio player soll funktionieren: 
- Media Extended Funktionalitäten generell sollten funktionieren
- Links in der Note sollten den aktiven player an die richtige timestamp setzen



Design des Audio Players. 

zweite Version mit Zeitleiste
![[Pasted image 20260713174127.png]]

13.07.20256 erste Version von einem eingebetteten Audio Player
![[Pasted image 20260713173429.png]]


## Pdf viewer: 


If the pdf is black and white, colours should get inverted in dark mode. (with black becoming the some colour as the background from the website, not exactly deep black)

On mobile, the pdf's should show a preview of the full page (also with next page, previous page controls) but when clicking (maybe only when clicking longer? or there could be an icon in the upper right corner) them they should open directly in the full pdf viewer.

der pdf viewer sollte irgendwie die funktion vor und zurückblättern haben. Außerdem sollte möglichst die ganze Seite gezeigt werden.


- Standardansicht: Eine komplette PDF-Seite wird eingepasst, ohne internes Scrollen.
- `←` / `→`: Blättern seitenweise.
- Oben rechts ein Fokus-/Expandieren-Button, ähnlich der Graph View.
- Im Fokusmodus wird der Viewer groß und fixiert dargestellt; erst dort darf man innerhalb des PDFs scrollen und eventuell zoomen.
- Ein `×` schließt den Fokusmodus wieder.

Auf Mobile würde ich es so lösen:

- Komplette aktuelle Seite als Vorschau.
- Vorherige/nächste Seite über sichtbare Buttons.
- Ein normales Antippen der Seite öffnet den vollständigen PDF-Viewer.
- Zusätzlich bleibt oben rechts ein eindeutiges „PDF öffnen“-Icon.

Langes Drücken würde ich nicht verwenden: Es ist schwer zu entdecken und löst auf Safari gerne das Kontextmenü aus. Ein sichtbares Icon plus antippbare Seitenfläche ist eindeutiger.

Der Unterschied wäre damit:

|Zustand|Blättern|Scrollen|PDF vollständig öffnen|
|---|---|---|---|
|Inline-Vorschau|Seitenweise|Nein|Icon bzw. auf Mobile Seitenfläche|
|Fokusmodus|Seitenweise|Ja|Direkter Link/Icon|
|System-PDF-Viewer|Nativ|Ja|Bereits geöffnet|

Ich würde den Button eher als „Fokusmodus“ mit Expandieren-Symbol `⛶` darstellen und nicht als klassische Stecknadel. Das beschreibt besser, dass der Viewer groß wird und Interaktion freigeschaltet ist.

Wichtig: Vor der Unterbrechung hatte ich lediglich `pdfjs-dist` als vorbereitende Abhängigkeit installiert. Der eigentliche Viewer-Umbau wurde noch nicht vorgenommen.


wenn die Seite breit genug ist, können auch zwei PDF Seiten nebeneinander angezeigt werden (im Fokusmodus aber auch in der Vorschau). Außerdem muss es die Möglichkeit zum zoomen geben. Im Fokusmodus sollte versucht werden, standardmäßig die ganze Seite zu zeigen (und vielleicht auch zwei Seiten gleichzeitig wie schon erwähnt). Außerdem muss man auch durch alle Seiten durchscrollen können, damit man z.B. schnell zur letzten Seite scrollen kann.
