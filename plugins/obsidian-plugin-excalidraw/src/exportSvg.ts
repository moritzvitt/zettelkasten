export interface ExportSvgNoteArea {
  fileId: string
  x: number
  y: number
  width: number
  height: number
  angle: number
}

export interface ExportSvgMetadata {
  viewBox: { width: number; height: number }
  noteAreas: ExportSvgNoteArea[]
}

function attribute(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}="([^"]+)"`, "i"))?.[1]
}

export function parseExportSvgMetadata(svg: string): ExportSvgMetadata | null {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0]
  const viewBox = root ? attribute(root, "viewBox") : undefined
  const values = viewBox?.trim().split(/\s+/).map(Number)
  if (!values || values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return null
  }

  const noteAreas: ExportSvgNoteArea[] = []
  const groupPattern =
    /<g\b[^>]*transform="translate\(([-\d.eE]+)[ ,]+([-\d.eE]+)\)\s+rotate\(([-\d.eE]+)[^)]*\)"[^>]*>\s*<use\b[^>]*href="#image-(?:crop-)?([a-f0-9]{40})(?:-[^"]+)?"[^>]*>/gi
  let match: RegExpExecArray | null

  while ((match = groupPattern.exec(svg)) !== null) {
    const useTag = match[0].slice(match[0].lastIndexOf("<use"))
    const width = Number(attribute(useTag, "width"))
    const height = Number(attribute(useTag, "height"))
    if (!Number.isFinite(width) || !Number.isFinite(height)) continue

    noteAreas.push({
      fileId: match[4]!,
      x: Number(match[1]),
      y: Number(match[2]),
      width,
      height,
      angle: Number(match[3]),
    })
  }

  return {
    viewBox: { width: values[2]!, height: values[3]! },
    noteAreas,
  }
}
