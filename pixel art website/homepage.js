;(function () {
  function initPixelHomepage() {
    const teapot = document.querySelector(".teapot-button")
    const zettel = document.querySelector("[aria-label='Zettelhaufen']")
    const objects = document.querySelectorAll(".object-button")
    const teapotSprite = document.querySelector(".teapot-sprite")
    const teacup = document.querySelector(".teacup-button")
    const teacupSprite = document.querySelector(".teacup-sprite")
    const zettelSprite = document.querySelector(".zettel-sprite")
    const garden = document.querySelector(".garden-button")
    const waterTurbulence = document.querySelector("#garden-water-turbulence")
    const waterDisplacement = document.querySelector("#garden-water-displacement")

    if (!teapot || !zettel || !teapotSprite || !teacupSprite || !zettelSprite) {
      return
    }

    if (teapot.dataset.pixelReady === "true" && zettel.dataset.pixelReady === "true") {
      return
    }

    teapot.dataset.pixelReady = "true"
    zettel.dataset.pixelReady = "true"

    const teapotContext = teapotSprite.getContext("2d")
    const teapotSheet = new Image()
    const teacupContext = teacupSprite.getContext("2d")
    const teacupSheet = new Image()
    const zettelContext = zettelSprite.getContext("2d")
    const zettelSheet = new Image()
    const teapotFrameWidth = 44
    const teapotFrameHeight = 45
    const teacupFrameWidth = 32
    const teacupFrameHeight = 32
    const zettelFrameWidth = 84
    const zettelFrameHeight = 81
    const frameDuration = 90
    const teapotEscapeStep = 150
    let teapotFrameCount = 1
    let teacupFrameCount = 1
    let zettelFrameCount = 1
    let teapotFrameTimer
    let teapotWalkTimer
    let teacupFrameTimer
    let zettelFrameTimer
    let teacupAnimating = false
    let zettelHoverPlayed = false
    let teapotClickCount = 0
    let teapotWalkX = 0
    let teapotFacing = 1
    let teapotState = "idle"
    let teapotBusy = false
    let teapotMoveSound
    let teapotTapSound
    let waterAnimationFrame
    let waterSound
    let gardenTapTimer
    let gardenTapArmed = false
    let gardenTouchClickUntil = 0

    function getTeapotMoveSound() {
      if (!teapotMoveSound) {
        teapotMoveSound = new Audio("/pixel/teapot-hop-sound.mp3")
        teapotMoveSound.loop = true
        teapotMoveSound.preload = "auto"
        teapotMoveSound.volume = 0.42
      }

      return teapotMoveSound
    }

    function startTeapotMoveSound() {
      const sound = getTeapotMoveSound()
      sound.currentTime = 0
      sound.play().catch(() => {})
    }

    function stopTeapotMoveSound() {
      if (!teapotMoveSound) {
        return
      }

      teapotMoveSound.pause()
      teapotMoveSound.currentTime = 0
    }

    function getTeapotTapSound() {
      if (!teapotTapSound) {
        teapotTapSound = new Audio("/pixel/teapot-hop-sound.mp3")
        teapotTapSound.loop = false
        teapotTapSound.preload = "auto"
        teapotTapSound.volume = 0.34
      }

      return teapotTapSound
    }

    function playTeapotTapSound() {
      const sound = getTeapotTapSound()
      sound.currentTime = 0
      sound.play().catch(() => {})
    }

    function getWaterSound() {
      if (!waterSound) {
        waterSound = new Audio("/pixel/koi-water-sound.m4a")
        waterSound.loop = true
        waterSound.preload = "auto"
        waterSound.volume = 0.32
      }

      return waterSound
    }

    function setWaterFrame(time) {
      if (!waterTurbulence || !waterDisplacement) {
        return
      }

      const pulse = (Math.sin(time / 1450) + 1) / 2
      const ripple = (Math.sin(time / 880) + 1) / 2
      const xFrequency = 0.018 + pulse * 0.018
      const yFrequency = 0.045 + ripple * 0.025
      const displacement = 8 + pulse * 5

      waterTurbulence.setAttribute(
        "baseFrequency",
        `${xFrequency.toFixed(3)} ${yFrequency.toFixed(3)}`,
      )
      waterDisplacement.setAttribute("scale", displacement.toFixed(2))
    }

    function animateWater(time) {
      setWaterFrame(time)
      waterAnimationFrame = window.requestAnimationFrame(animateWater)
    }

    function startWaterEffect() {
      if (!garden) {
        return
      }

      garden.classList.add("is-water-active")

      if (!waterAnimationFrame) {
        waterAnimationFrame = window.requestAnimationFrame(animateWater)
      }

      getWaterSound()
        .play()
        .catch(() => {})
    }

    function stopWaterEffect() {
      if (!garden) {
        return
      }

      garden.classList.remove("is-water-active")

      if (waterAnimationFrame) {
        window.cancelAnimationFrame(waterAnimationFrame)
        waterAnimationFrame = undefined
      }

      if (waterTurbulence) {
        waterTurbulence.setAttribute("baseFrequency", "0.018 0.045")
      }

      if (waterDisplacement) {
        waterDisplacement.setAttribute("scale", "0")
      }

      if (waterSound) {
        waterSound.pause()
        waterSound.currentTime = 0
      }
    }

    function prepareAudio() {
      getTeapotMoveSound().load()
      getTeapotTapSound().load()
      getWaterSound().load()
    }

    function playGardenTouchPreview() {
      startWaterEffect()
      window.clearTimeout(gardenTapTimer)
      gardenTapTimer = window.setTimeout(() => {
        gardenTapArmed = false
        stopWaterEffect()
      }, 1800)
    }

    function openGardenLink() {
      if (!garden?.href) {
        return
      }

      window.location.href = garden.href
    }

    function handleGardenPointerDown(event) {
      prepareAudio()

      if (event.pointerType !== "touch" && event.pointerType !== "pen") {
        return
      }

      event.preventDefault()
      gardenTouchClickUntil = Date.now() + 700

      if (gardenTapArmed) {
        window.clearTimeout(gardenTapTimer)
        gardenTapArmed = false
        openGardenLink()
        return
      }

      gardenTapArmed = true
      playGardenTouchPreview()
    }

    function handleGardenClick(event) {
      if (gardenTapArmed || Date.now() < gardenTouchClickUntil) {
        event.preventDefault()
      }
    }

    function showTeapotFrame(frame) {
      teapotContext.clearRect(0, 0, teapotFrameWidth, teapotFrameHeight)
      teapotContext.drawImage(
        teapotSheet,
        frame * teapotFrameWidth,
        0,
        teapotFrameWidth,
        teapotFrameHeight,
        0,
        0,
        teapotFrameWidth,
        teapotFrameHeight,
      )
    }

    function showZettelFrame(frame) {
      zettelContext.clearRect(0, 0, zettelFrameWidth, zettelFrameHeight)
      zettelContext.drawImage(
        zettelSheet,
        frame * zettelFrameWidth,
        0,
        zettelFrameWidth,
        zettelFrameHeight,
        0,
        0,
        zettelFrameWidth,
        zettelFrameHeight,
      )
    }

    function showTeacupFrame(frame) {
      teacupContext.clearRect(0, 0, teacupFrameWidth, teacupFrameHeight)
      teacupContext.drawImage(
        teacupSheet,
        frame * teacupFrameWidth,
        0,
        teacupFrameWidth,
        teacupFrameHeight,
        0,
        0,
        teacupFrameWidth,
        teacupFrameHeight,
      )
    }

    function playTeacupAnimation() {
      if (!teacupSheet.complete || teacupFrameCount < 2 || teacupAnimating) {
        return Promise.resolve()
      }

      clearInterval(teacupFrameTimer)
      teacupAnimating = true

      return new Promise((resolve) => {
        let frame = 1
        showTeacupFrame(frame)
        teacupFrameTimer = window.setInterval(() => {
          frame += 1
          showTeacupFrame(frame)

          if (frame === teacupFrameCount - 1) {
            clearInterval(teacupFrameTimer)
            teacupAnimating = false
            showTeacupFrame(0)
            resolve()
          }
        }, frameDuration)
      })
    }

    function playTeapotAnimation() {
      if (!teapotSheet.complete || teapotFrameCount < 2) {
        return
      }

      clearInterval(teapotFrameTimer)
      playTeapotTapSound()

      let frame = 1
      showTeapotFrame(frame)
      teapotFrameTimer = window.setInterval(() => {
        frame += 1
        showTeapotFrame(frame)

        if (frame === teapotFrameCount - 1) {
          clearInterval(teapotFrameTimer)
        }
      }, frameDuration)
    }

    function updateTeapotTransform() {
      teapotSprite.style.transform = `translateX(${teapotWalkX}px) scaleX(${teapotFacing})`
    }

    function showTeacup() {
      teacup?.classList.add("is-visible")
    }

    function hideTeacup() {
      teacup?.classList.remove("is-visible")
    }

    function waitForTeapot(ms) {
      return new Promise((resolve) => {
        teapotWalkTimer = window.setTimeout(resolve, ms)
      })
    }

    function getTeapotMoveFrames() {
      const frames = []
      const firstHoldFrame = Math.max(0, teapotFrameCount - 3)

      for (let frame = 0; frame < firstHoldFrame; frame += 1) {
        frames.push(frame)
      }

      return frames
    }

    function getTeapotHoldFrames() {
      return [teapotFrameCount - 3, teapotFrameCount - 2, teapotFrameCount - 1].filter(
        (frame) => frame >= 0,
      )
    }

    async function runTeapotStep(direction, distance) {
      clearInterval(teapotFrameTimer)
      clearTimeout(teapotWalkTimer)
      teapotFacing = direction

      const moveFrames = getTeapotMoveFrames()
      if (moveFrames.length === 0) {
        return
      }

      const distancePerFrame = distance / moveFrames.length
      startTeapotMoveSound()

      try {
        for (const frame of moveFrames) {
          teapotWalkX += direction * distancePerFrame
          showTeapotFrame(frame)
          updateTeapotTransform()
          await waitForTeapot(frameDuration)
        }

        for (const frame of getTeapotHoldFrames()) {
          showTeapotFrame(frame)
          updateTeapotTransform()
          await waitForTeapot(frameDuration)
        }
      } finally {
        stopTeapotMoveSound()
      }

      showTeapotFrame(0)
    }

    async function returnTeapot() {
      if (teapotBusy || teapotWalkX === 0) {
        return
      }

      teapotBusy = true
      teapotState = "returning"
      hideTeacup()

      try {
        while (Math.abs(teapotWalkX) > 1) {
          const distance = Math.min(teapotEscapeStep, Math.abs(teapotWalkX))
          const direction = teapotWalkX > 0 ? -1 : 1
          await runTeapotStep(direction, distance)
        }

        teapotWalkX = 0
        teapotFacing = 1
        updateTeapotTransform()
        showTeapotFrame(0)
        teapot.classList.remove("is-walking-away")
        teapotClickCount = 0
        teapotState = "idle"
      } finally {
        teapotBusy = false
      }
    }

    async function handleTeacupClick() {
      if (teapotBusy) {
        return
      }

      await playTeacupAnimation()
      returnTeapot()
    }

    async function evadeTeapot(event) {
      if (teapotState !== "settled" || teapotBusy) {
        return
      }

      teapotBusy = true
      const spriteBox = teapotSprite.getBoundingClientRect()
      const cursorX = event.clientX ?? spriteBox.left + spriteBox.width / 2
      const centerX = spriteBox.left + spriteBox.width / 2
      const direction = cursorX < centerX ? 1 : -1

      showTeacup()
      await runTeapotStep(direction, teapotEscapeStep)
      teapotBusy = false
    }

    function handleTeapotClick(event) {
      if (teapotBusy) {
        return
      }

      prepareAudio()

      if (teapotState === "settled") {
        evadeTeapot(event)
        return
      }

      teapotClickCount += 1

      if (teapotClickCount >= 2) {
        teapot.classList.add("is-walking-away")
        teapotState = "settled"
        evadeTeapot(event)
        return
      }

      playTeapotAnimation()
    }

    function playZettelAnimation() {
      if (!zettelSheet.complete || zettelFrameCount < 2) {
        return
      }

      clearInterval(zettelFrameTimer)

      let frame = 1
      showZettelFrame(frame)
      zettelFrameTimer = window.setInterval(() => {
        frame += 1
        showZettelFrame(frame)

        if (frame === zettelFrameCount - 1) {
          clearInterval(zettelFrameTimer)
        }
      }, frameDuration)
    }

    function resetZettelAnimation() {
      clearInterval(zettelFrameTimer)
      showZettelFrame(0)
    }

    function playZettelAnimationOnFirstHover() {
      if (zettelHoverPlayed) {
        return
      }

      zettelHoverPlayed = true
      playZettelAnimation()
    }

    function selectObject(event) {
      objects.forEach((object) => object.classList.remove("is-selected"))
      event.currentTarget.classList.add("is-selected")
    }

    teapot.addEventListener("click", handleTeapotClick)
    teapot.addEventListener("mouseenter", evadeTeapot)
    teapotSprite.addEventListener("mouseenter", evadeTeapot)
    teacup?.addEventListener("click", handleTeacupClick)
    zettel.addEventListener("mouseenter", playZettelAnimationOnFirstHover)
    zettel.addEventListener("mouseleave", resetZettelAnimation)
    zettel.addEventListener("click", playZettelAnimation)
    if (garden) {
      garden.addEventListener("pointerenter", startWaterEffect)
      garden.addEventListener("pointerleave", stopWaterEffect)
      garden.addEventListener("mouseenter", startWaterEffect)
      garden.addEventListener("mouseleave", stopWaterEffect)
      garden.addEventListener("focus", startWaterEffect)
      garden.addEventListener("blur", stopWaterEffect)
      garden.addEventListener("pointerdown", handleGardenPointerDown)
      garden.addEventListener("click", handleGardenClick)
    }
    objects.forEach((object) => object.addEventListener("click", selectObject))
    teapotSheet.addEventListener("load", () => {
      teapotFrameCount = Math.floor(teapotSheet.naturalWidth / teapotFrameWidth)
      showTeapotFrame(0)
    })
    teacupSheet.addEventListener("load", () => {
      teacupFrameCount = Math.floor(teacupSheet.naturalWidth / teacupFrameWidth)
      showTeacupFrame(0)
    })
    zettelSheet.addEventListener("load", () => {
      zettelFrameCount = Math.floor(zettelSheet.naturalWidth / zettelFrameWidth)
      showZettelFrame(0)
    })
    teapotSheet.src = "/pixel/teekanne.png"
    teacupSheet.src = "/pixel/teatasse-sprite.png?v=20260617-2"
    zettelSheet.src = "/pixel/zettelhaufen.png"

    if (typeof window.addCleanup === "function") {
      window.addCleanup(() => {
        clearInterval(teapotFrameTimer)
        clearTimeout(teapotWalkTimer)
        clearInterval(teacupFrameTimer)
        clearInterval(zettelFrameTimer)
        window.clearTimeout(gardenTapTimer)
        stopTeapotMoveSound()
        stopWaterEffect()
      })
    }
  }

  window.initPixelHomepage = initPixelHomepage

  if (!window.__pixelHomepageRuntimeInstalled) {
    window.__pixelHomepageRuntimeInstalled = true
    document.addEventListener("nav", initPixelHomepage)

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initPixelHomepage, { once: true })
    } else {
      initPixelHomepage()
    }
  } else {
    initPixelHomepage()
  }
})()
