# Moritz Zettelkasten Website

Dieses Projekt veröffentlicht ausgewählte Zettel aus dem Obsidian-Vault als Quartz-Website.

Die Quelle ist standardmäßig:

```txt
/Users/moritzvitt/Notes/Obsidian Notes
```

Der Build schreibt die Website nach `public/`; dieser Ordner wird nicht committed.

Die veröffentlichte Obsidian-Notiz `Digital Garden/Digital Garden.md` wird als
reguläre Quartz-Startseite nach `content/index.md` synchronisiert. Die früheren
Dateinamen `Welcome in my Digital Garden!.md` werden weiterhin erkannt.
`custom-path`-Properties werden beim Sync ignoriert.

## Lokaler Workflow

```sh
npm run dev
```

Der Befehl synchronisiert die Zettel, baut Quartz und startet den lokalen Server.

Für einen reinen Build:

```sh
npm run build
```

## Veröffentlichen

Die Veröffentlichung wird direkt in Obsidian über Properties gesteuert. Eine Notiz wird nur übernommen, wenn sie im Frontmatter explizit markiert ist:

```yaml
publish: true
```

Alternativ wird auch die Property des Obsidian-Digital-Garden-Plugins akzeptiert:

```yaml
dg-publish: true
```

`draft: true`, `publish: false` und `dg-publish: false` schließen eine Notiz ausdrücklich aus.

Der gesamte Vault wird durchsucht. Der Quellordner ist daher unerheblich:
`publish: true` funktioniert beispielsweise gleichermaßen unter `Digital Garden/`,
`journal/` und `workspace/`. Für bestehende Notizen unter `Digital Garden/` bleibt
der bisherige öffentliche Pfad ohne zusätzliches `/digital-garden/`-Segment erhalten.

## Lokale Medien

Der Sync trennt lokale Obsidian-Dateien bewusst vom öffentlichen Build:

- Referenzierte Bilder unter `/Users/moritzvitt/Pictures` werden nur für veröffentlichte
  Notizen nach `content/` kopiert und auf relative Webpfade umgeschrieben.
- `captions` sowie lokale SRT-/VTT-Links werden nicht veröffentlicht.
- Lokale Filme und Videos unter `/Users/moritzvitt/Movies` werden weder kopiert noch als
  `file:///`-Pfade in den öffentlichen Markdown-Dateien ausgegeben.
- Externe Webmedien wie YouTube-URLs bleiben erhalten.

Die lokalen Pfade in den Obsidian-Quelldateien werden dabei nicht verändert.

## GitHub Pages

Die Action `.github/workflows/github-pages.yaml` baut die Website automatisch bei Pushes auf `main` oder `v5`.

Einmalig in GitHub einstellen:

1. Repository auf GitHub erstellen.
2. Diese lokale Kopie auf dein Repository umhängen:

   ```sh
   git remote set-url origin git@github.com:moritzvitt/REPO-NAME.git
   git push -u origin v5
   ```

3. In GitHub unter `Settings -> Pages -> Build and deployment` die Quelle `GitHub Actions` auswählen.

Die Action setzt `baseUrl` beim Build automatisch auf `OWNER.github.io/REPO-NAME`.

## Andere Quelle

Zum Testen mit einem anderen Vault oder Notizordner:

```sh
ZETTEL_SOURCE_ROOT="/pfad/zum/ordner" npm run build
```

Für isolierte Sync-Tests lassen sich außerdem `ZETTEL_PICTURES_ROOT`,
`ZETTEL_MOVIES_ROOT` und `ZETTEL_TRANSCRIPTS_ROOT` überschreiben.
