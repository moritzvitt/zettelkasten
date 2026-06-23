import { describe, expect, it } from "vitest"
import { parseExportSvgMetadata } from "../src/exportSvg"

describe("parseExportSvgMetadata", () => {
  it("extracts the viewBox and embedded note positions", () => {
    const svg = `<svg viewBox="0 0 800 600"><g transform="translate(20 30) rotate(0 100 50)"><use href="#image-0123456789abcdef0123456789abcdef01234567" width="200" height="100"></use></g></svg>`

    expect(parseExportSvgMetadata(svg)).toEqual({
      viewBox: { width: 800, height: 600 },
      noteAreas: [
        {
          fileId: "0123456789abcdef0123456789abcdef01234567",
          x: 20,
          y: 30,
          width: 200,
          height: 100,
          angle: 0,
        },
      ],
    })
  })

  it("recognizes cropped embedded notes", () => {
    const svg = `<svg viewBox="0 0 10 10"><g transform="translate(1, 2) rotate(3 4 5)"><use href="#image-crop-abcdefabcdefabcdefabcdefabcdefabcdefabcd-123" width="6" height="7"></use></g></svg>`

    expect(parseExportSvgMetadata(svg)?.noteAreas[0]?.fileId).toBe(
      "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    )
  })
})
