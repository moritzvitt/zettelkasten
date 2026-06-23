import type { FilePath, QuartzPluginData } from "@quartz-community/types";
import { slugifyFilePath } from "@quartz-community/utils/path";

function normalizeNoteReference(value: string): string {
  return value
    .replaceAll("\\", "/")
    .replace(/^Digital Garden\//i, "")
    .replace(/\.md$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .toLocaleLowerCase();
}

export function resolveEmbedPage(
  target: string,
  allFiles: QuartzPluginData[],
): QuartzPluginData | undefined {
  const noteTarget = target.split("|", 1)[0]!.split("#", 1)[0]!.trim();
  const normalizedTarget = normalizeNoteReference(noteTarget);
  const targetName = normalizedTarget.split("/").pop() ?? normalizedTarget;
  const targetSlug = slugifyFilePath(noteTarget as FilePath);

  return allFiles.find((file) => {
    if (!file.slug) return false;
    const source = normalizeNoteReference(String(file.frontmatter?.source ?? file.filePath ?? ""));
    const title = String(file.frontmatter?.title ?? "").trim().toLocaleLowerCase();
    const lastSegment = file.slug.split("/").pop();
    return (
      source === normalizedTarget ||
      source.endsWith(`/${normalizedTarget}`) ||
      title === targetName ||
      file.slug === targetSlug ||
      lastSegment === targetSlug
    );
  });
}
