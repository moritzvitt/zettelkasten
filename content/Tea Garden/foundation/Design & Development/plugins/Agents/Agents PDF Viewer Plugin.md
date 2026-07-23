---
title: "Agents PDF Viewer Plugin"
source: "Digital Garden/Tea Garden/foundation/Design & Development/plugins/Agents/Agents PDF Viewer Plugin.md"
publish: true
tags:
  - zettel
---
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


> [!Error] warum ist es unscharf im darkmode (inverted)?:
> Weil das PDF nicht mehr als Vektorgrafik dargestellt wird, sondern PDF.js jede Seite zuerst in ein Canvas-Bild rendert. Drei Dinge verstärken die Unschärfe:
> 
> - Die Auflösung ist auf maximal `2×` begrenzt. Viele iPhones haben jedoch `3×` Pixeldichte und skalieren das Canvas daher hoch.
> - `filter: invert(1)` plus `mix-blend-mode: screen` wird anschließend auf das fertige Bitmap angewendet. Besonders Safari reduziert dabei den Kantenkontrast.
> - Bei zwei Seiten nebeneinander werden Noten und Schrift zusätzlich stark verkleinert.
> 
> Die größte technische Ursache ist die Begrenzung in [runtime.js (line 63)](/Users/moritzvitt/src/zettelkasten-website/plugins/pdf-viewer/src/runtime.js:63); die wahrgenommene Weichheit im Dark Mode kommt zusätzlich aus [index.js (line 83)](/Users/moritzvitt/src/zettelkasten-website/plugins/pdf-viewer/src/index.js:83).
> 
> Ich würde als Korrektur mit der tatsächlichen Pixeldichte bis maximal `3×` rendern und den `screen`-Blendmodus durch eine kontrastschonendere Farbanpassung ersetzen.
>
