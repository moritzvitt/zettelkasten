import type { PageFrame, PageFrameProps } from "@quartz-community/types"
import type { ComponentChildren } from "preact"

export const ExcalidrawFrame: PageFrame = {
  name: "excalidraw",
  css: `
.page[data-frame="excalidraw"] {
  max-width: none;
  margin: 0;
  min-height: 100vh;
}

.page[data-frame="excalidraw"] > #quartz-body {
  grid-template-columns: auto;
  grid-template-rows: 1fr;
  grid-template-areas:
    "grid-center";
  height: 100vh;
  padding: 0;
}

.page[data-frame="excalidraw"] > #quartz-body > .center.excalidraw-frame {
  max-width: 100%;
  min-width: 100%;
  height: 100%;
  margin: 0;
}

.page[data-frame="excalidraw"] > #quartz-body.lock-scroll > * {
  transform: none;
}
`,
  render({ componentData, pageBody: Content }: PageFrameProps): unknown {
    const renderSlot = (Component: (props: typeof componentData) => unknown): ComponentChildren =>
      Component(componentData) as ComponentChildren
    return (
      <div class="center excalidraw-frame">
        <div class="excalidraw-stage">{renderSlot(Content)}</div>
      </div>
    )
  },
}
