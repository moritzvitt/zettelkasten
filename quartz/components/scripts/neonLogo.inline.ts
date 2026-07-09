type NeonAudio = {
  context: AudioContext
  gain: GainNode
  oscillators: OscillatorNode[]
}

let audio: NeonAudio | undefined

function createNeonHum(): NeonAudio {
  const context = new AudioContext()
  const gain = context.createGain()
  const frequencies = [50, 100.4]
  const oscillators = frequencies.map((frequency, index) => {
    const oscillator = context.createOscillator()
    const oscillatorGain = context.createGain()

    oscillator.type = index === 0 ? "sine" : "triangle"
    oscillator.frequency.value = frequency
    oscillator.detune.value = index === 0 ? 0 : 4
    oscillatorGain.gain.value = index === 0 ? 0.75 : 0.18
    oscillator.connect(oscillatorGain).connect(gain)
    oscillator.start()
    return oscillator
  })

  gain.gain.value = 0
  gain.connect(context.destination)
  return { context, gain, oscillators }
}

function setHumVolume(target: number) {
  audio ??= createNeonHum()
  const { context, gain } = audio
  void context.resume()
  const now = context.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(gain.gain.value, now)
  gain.gain.linearRampToValueAtTime(target, now + 0.18)
}

function stopHum() {
  if (!audio) return
  const { context, gain } = audio
  const now = context.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(gain.gain.value, now)
  gain.gain.linearRampToValueAtTime(0, now + 0.24)
}

async function setupNeonLogo() {
  const title = document.querySelector<HTMLElement>(".page-title")
  const link = title?.querySelector<HTMLAnchorElement>("a")
  if (!title || !link || title.dataset.neonLogoReady === "true") return

  title.dataset.neonLogoReady = "true"

  try {
    title.classList.add("neon-logo--starting")
    window.setTimeout(() => title.classList.remove("neon-logo--starting"), 1400)

    link.addEventListener("pointerenter", () => {
      title.classList.add("neon-logo--hovered")
      setHumVolume(0.026)
    })
    link.addEventListener("pointerleave", () => {
      title.classList.remove("neon-logo--hovered")
      stopHum()
    })
    link.addEventListener("blur", () => {
      title.classList.remove("neon-logo--hovered")
      stopHum()
    })
  } catch (error) {
    console.warn("Could not initialize the neon logo", error)
  }
}

document.addEventListener("nav", setupNeonLogo)
void setupNeonLogo()
