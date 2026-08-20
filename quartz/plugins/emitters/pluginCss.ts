import { compileString } from "sass"
import { Features, transform } from "lightningcss"

type LightningTargets = NonNullable<Parameters<typeof transform>[0]["targets"]>

const quartzThemesHeader =
  /^@layer quartz-base, obsidian-theme, quartz-themes-base, obsidian-theme-overrides;/

function isQuartzThemesResource(css: string): boolean {
  return quartzThemesHeader.test(css) && css.includes("/* aspect:")
}

/**
 * quartz-themes currently emits SCSS nesting as an inline CSS resource. Some
 * themes also contain malformed checkbox data URLs and two unterminated
 * commented custom properties in the shared template. Normalize that resource
 * before handing it back to Lightning CSS.
 *
 * The plugin's generic checkbox icon rules are emitted before the aspect blocks,
 * so removing a broken theme-specific checkbox aspect retains usable checkboxes.
 */
export function repairQuartzThemesResource(css: string): string {
  return css
    .replace(
      /\/\* aspect: checkboxes \*\/[\s\S]*?(?=\/\* aspect: [a-zA-Z]+ \*\/|\/\* === quartz-themes template styles)/g,
      "",
    )
    .replace(/^([ \t]*\/\*\s*--[^\n]*;\s*)$/gm, "$1 */")
    .replace(/&body\b/g, "& body")
}

export function compileInlineCssResource(content: string, targets: LightningTargets): string {
  const lightningOptions = {
    filename: "plugin-resource.css",
    minify: true,
    targets,
    include: Features.MediaQueries,
  } as const

  try {
    return transform({
      ...lightningOptions,
      code: Buffer.from(content),
    }).code.toString()
  } catch (initialError) {
    if (!isQuartzThemesResource(content)) {
      return content
    }

    try {
      const repaired = repairQuartzThemesResource(content)
      const compiled = compileString(repaired, {
        syntax: "scss",
        style: "expanded",
      }).css

      return transform({
        ...lightningOptions,
        code: Buffer.from(compiled),
      }).code.toString()
    } catch (repairError) {
      throw new AggregateError(
        [initialError, repairError],
        "Could not compile the quartz-themes stylesheet",
      )
    }
  }
}
