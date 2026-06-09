# Handoff: Structured Brain for Quartz

## Goal

Build an Excalibrain-like structured 2D graph for the Quartz Zettelkasten site without replacing Quartz's existing force-directed graph.

The structured view should make typed note relationships visually explicit:

- `Parent` above
- `Child` below
- `Prev` left
- `Next` right
- `Friend` lateral/below
- inferred inverse relationships
- optional sibling relationships

## Repository

- Project: `/Users/moritzvitt/src/zettelkasten-website`
- Branch: `v5`
- Last commit: `d8c2467 Add structured brain graph view`
- Local site: `http://localhost:8091`
- A static server is currently listening on port `8091`.

## Implemented

### Structured Brain plugin

New local Quartz plugin:

`plugins/structured-brain/`

Important files:

- `plugins/structured-brain/src/components/StructuredBrain.js`
- `plugins/structured-brain/package.json`
- `plugins/structured-brain/scripts/build.mjs`

The component:

- renders in Quartz's `beforeBody` position in the main column
- uses a deterministic SVG layout rather than a force simulation
- has depth controls for levels 1, 2, and 3
- defaults to depth 2
- supports mouse-wheel zoom
- supports click-and-drag panning on empty canvas space
- supports node navigation by click or keyboard
- has a fullscreen/modal view
- keeps the existing light canvas color

### Typed relationship index

`scripts/sync-zettel.mjs` now generates:

`quartz/static/brain-index.json`

The index contains:

- published note nodes
- explicit typed edges
- inferred inverse edges
- inferred sibling edges

Supported relationship fields:

- `Parent::`
- `Child::`
- `Prev::`
- `Next::`
- `Friend::`

The relationship parser deliberately reads fields inside Obsidian `%%` comment blocks.

### Quartz integration

Changed:

- `package.json`
- `scripts/use-local-graph.mjs`
- `quartz.config.yaml`

The build pipeline builds and symlinks `structured-brain`.

The Quartz table of contents and backlinks components are disabled.

## Current uncommitted work

After commit `d8c2467`, readability improvements were made but have not yet been committed:

- graph height increased from 520px to 620px
- node titles wrap to two lines
- node dimensions adapt to title length
- groups wrap vertically when horizontal space is insufficient
- second-level nodes are placed near their first-level anchor instead of on one large ring
- friends were moved farther below the center
- inferred edges are visually quieter
- overlap checks on the tested page report no node overlaps

Files currently modified for this work:

- `plugins/structured-brain/src/components/StructuredBrain.js`
- `plugins/structured-brain/package.json`
- `quartz.config.yaml`

There are many unrelated generated/content changes in the working tree. Do not stage them accidentally.

## Verification

Successful command:

```sh
npm run build
```

The current structured-brain browser script passes:

```sh
node --check public/static/scripts/script-1-*.js
```

Verified page:

`http://localhost:8091/anki-f%C3%BCr's-sprachen-lernen/anki's-probleme-f%C3%BCrs-sprachenlernen/anki-kostet-zeit%E2%8F%B3-und-aufmerksamkeit-%F0%9F%A7%A0`

On that page:

- SVG renders
- 7 nodes render at depth 2
- 11 edges render
- labels use one or two lines
- automated bounding-box inspection found no node overlaps

## Next requested feature

Add four Excalibrain-style relationship ports to every node:

- top port
- left port
- right port
- bottom port

Edges should terminate at the appropriate port rather than at the center of the node.

Recommended mapping:

- `parent`: top
- `child`: bottom
- `prev`: left
- `next`: right
- `friend`: choose left/right based on the target's relative position
- `sibling`: choose the nearest lateral port

Implementation approach:

1. Store the final node width and height alongside each node position.
2. Add a `portFor(node, relationType, otherNode)` helper.
3. Draw edges from source port to target inverse port.
4. Render four small SVG circles after each node rectangle.
5. Give ports relation-specific classes for subtle highlighting.
6. Keep the ports visible but restrained on the light canvas.

## Design reference

The user supplied an Obsidian Excalibrain screenshot showing:

- compact rectangular nodes
- a clear highlighted center node
- four small connection points around each node
- lines attached to those ports
- substantial spacing between hierarchy levels

Do not change the canvas to the dark blue Obsidian color; the user explicitly asked to keep the current light canvas.

## Cautions

- Quartz is static; the graph index is generated at build time.
- `quartz/static/brain-index.json` must remain tracked or otherwise copied into `public/static`, because deployments may not have access to the local Obsidian vault.
- The site uses SPA navigation. Rebind/render on `nav` and `render` events.
- Old browser console logs may contain stale `brain-index.json` errors from earlier builds; fresh tabs currently render correctly.
- Preserve unrelated content changes in the dirty working tree.
