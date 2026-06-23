# Moritz Zettelkasten Website

Dieses Projekt veröffentlicht ausgewählte Zettel aus dem Obsidian-Vault als Quartz-Website.

Die Quelle ist standardmäßig:

```txt
/Users/moritzvitt/Notes/Obsidian Notes/Digital Garden
```

Der Build schreibt die Website nach `public/`; dieser Ordner wird nicht committed.

Die veröffentlichte Obsidian-Notiz `Welcome in my Digital Garden!.md` wird als
reguläre Quartz-Startseite nach `content/index.md` synchronisiert. Das gilt
auch, wenn sie unter `Tea Garden/Welcome in my Digital Garden!.md` liegt. Andere
Notizen mit `custom-path: /` bleiben als benannte Dateien im Content-Root.

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
