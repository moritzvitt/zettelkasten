import assert from "node:assert/strict"
import test from "node:test"
import { compileInlineCssResource, repairQuartzThemesResource } from "./pluginCss"

const targets = {
  safari: (15 << 16) | (6 << 8),
  chrome: 109 << 16,
}

const brokenQuartzTheme = `@layer quartz-base, obsidian-theme, quartz-themes-base, obsidian-theme-overrides;
@layer obsidian-theme {
/* aspect: base */
:root:root { --light: #f4f5f7; --secondary: #2e7de9; }
/* aspect: checkboxes */
html[saved-theme="light"] body li.task-list-item[data-task=", html[saved-theme="light"] "] {
  mask-image: url("data:image/svg+xml,<style>.icon{fill:none;</style>");
}
/* aspect: callouts */
html[saved-theme="light"] .callout { --callout-color: 46, 125, 233; }
/* === quartz-themes template styles (ported from v4) === */
.explorer {
  .folder-container {
    /* --folder-closed-icon: url('folder.svg');
    color: var(--secondary);
  }
}
@media (max-width: 1200px) {
  :root[saved-theme="light"] {
    &body .sidebar { background: transparent; }
  }
}
}`

test("repairs malformed quartz-themes CSS without dropping light mode or callouts", () => {
  const output = compileInlineCssResource(brokenQuartzTheme, targets)

  assert.match(output, /--light:#f4f5f7/)
  assert.match(output, /--secondary:#2e7de9/)
  assert.match(output, /--callout-color:46,\s*125,\s*233/)
  assert.doesNotMatch(output, /data-task/)
  assert.match(output, /saved-theme=light/)
})

test("leaves unrelated invalid plugin CSS unchanged", () => {
  const invalidCss =
    'html[saved-theme="dark"] .broken[data-value=", html[saved-theme="dark"] "] { color: red; }'

  assert.equal(compileInlineCssResource(invalidCss, targets), invalidCss)
})

test("closes shared-template comments and fixes nested body selectors", () => {
  const repaired = repairQuartzThemesResource(brokenQuartzTheme)

  assert.match(repaired, /--folder-closed-icon: url\('folder\.svg'\); \*\//)
  assert.match(repaired, /& body \.sidebar/)
})
