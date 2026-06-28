(() => {
  const treeConfigs = [
    { x: "6%", h: "8rem", glow: "#66ff33", delay: "0ms" },
    { x: "17%", h: "11rem", glow: "#00e5ff", delay: "90ms" },
    { x: "29%", h: "7rem", glow: "#f7ff4a", delay: "170ms" },
    { x: "43%", h: "13rem", glow: "#ff4fd8", delay: "240ms" },
    { x: "59%", h: "9rem", glow: "#39ff14", delay: "330ms" },
    { x: "72%", h: "12rem", glow: "#8b5cff", delay: "410ms" },
    { x: "86%", h: "7.5rem", glow: "#ff8a00", delay: "500ms" },
  ]

  function createGarden() {
    const garden = document.createElement("div")
    garden.className = "tea-tree-garden"
    garden.setAttribute("aria-hidden", "true")

    for (const tree of treeConfigs) {
      const img = document.createElement("img")
      img.className = "tea-tree-garden__tree"
      img.src = "/static/baum.svg"
      img.alt = ""
      img.style.setProperty("--tree-x", tree.x)
      img.style.setProperty("--tree-height", tree.h)
      img.style.setProperty("--tree-glow", tree.glow)
      img.style.setProperty("--tree-delay", tree.delay)
      garden.append(img)
    }

    document.body.append(garden)
    return garden
  }

  function bloomGarden() {
    const current = document.querySelector(".tea-tree-garden")
    current?.remove()

    const garden = createGarden()
    window.setTimeout(() => garden.classList.add("is-lit"), 20)
  }

  function bindTeaKettle() {
    const kettle = document.querySelector(".tea-kettle-easter-egg")
    if (!kettle || kettle.dataset.treeGardenBound === "true") return

    kettle.dataset.treeGardenBound = "true"
    kettle.addEventListener("click", bloomGarden)
    kettle.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return
      event.preventDefault()
      bloomGarden()
    })
  }

  document.addEventListener("nav", bindTeaKettle)
  bindTeaKettle()
})()
