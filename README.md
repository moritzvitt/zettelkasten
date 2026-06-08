# Moritz Zettelkasten Website

Dieses Projekt veröffentlicht ausgewählte Zettel aus dem Obsidian-Vault als Quartz-Website.

Die Quelle ist standardmäßig:

```txt
/Users/moritzvitt/Notes/Obsidian Notes/LLM Wiki/notes/zettel
```

Der Build schreibt die Website nach `public/`; dieser Ordner wird nicht committed.

## Lokaler Workflow

```sh
npm run dev
```

Der Befehl synchronisiert die Zettel, baut Quartz und startet den lokalen Server.

Für einen reinen Build:

```sh
npm run build
```

Für den aktuellen ersten Veröffentlichungsstand nur mit Spracherwerb-Notizen:

```sh
npm run build:spracherwerb
```

## Veröffentlichen

Der normale Modus veröffentlicht den kuratierten Zettelbestand aus `LLM Wiki/notes/zettel`. Einzelne Notizen bleiben draußen, wenn sie im Frontmatter eines davon setzen:

Der aktuelle GitHub-Stand enthält bewusst nur den Unterordner `Immersion und Spracherwerb`.

```yaml
draft: true
publish: false
dg-publish: false
```

Wenn die Website später nur noch explizit markierte Notizen veröffentlichen soll, nutze:

```sh
npm run build:explicit
```

Dann werden nur Notizen mit einem dieser Frontmatter-Felder übernommen:

```yaml
publish: true
dg-publish: true
```

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

Zum Testen mit einem anderen Notizordner:

```sh
ZETTEL_SOURCE_ROOT="/pfad/zum/ordner" npm run build
```
