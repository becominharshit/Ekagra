import { useEffect, useRef } from 'react'

// A short, soft chime when a focus or break phase ends, so you don't have to watch the clock.
// Made with the browser's Web Audio API: no sound file and no library. Browsers only allow
// sound after a tap, so the first tap in the app switches it on.

let audio: AudioContext | null = null

/** Call from a tap (Start focus, or any tap while a session runs) so the chime may play later. */
export function allowChime(): void {
  try {
    audio ??= new AudioContext()
    void audio.resume()
  } catch {
    audio = null // No Web Audio here: the chime stays silent.
  }
}

/** Two soft notes, and a short buzz on phones that can. */
export function chime(): void {
  if ('vibrate' in navigator) navigator.vibrate(200)
  if (!audio || audio.state !== 'running') return
  const start = audio.currentTime
  for (const [index, frequency] of [660, 880].entries()) {
    const at = start + index * 0.25
    const tone = audio.createOscillator()
    const volume = audio.createGain()
    tone.frequency.value = frequency
    volume.gain.setValueAtTime(0.0001, at)
    volume.gain.exponentialRampToValueAtTime(0.2, at + 0.02)
    volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.6)
    tone.connect(volume).connect(audio.destination)
    tone.start(at)
    tone.stop(at + 0.65)
  }
}

/** Chimes when the timer moves on to its next phase (focus → break → focus …, or the end). */
export function usePhaseChime(index: number): void {
  const last = useRef(index)
  useEffect(() => {
    if (index > last.current) chime()
    last.current = index
  }, [index])
  useEffect(() => {
    window.addEventListener('pointerdown', allowChime, { once: true })
    return () => window.removeEventListener('pointerdown', allowChime)
  }, [])
}
