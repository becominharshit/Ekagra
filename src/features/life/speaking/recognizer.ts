import { browserLocale } from '@/lib/currency'
import { joinSpeech } from './speech'

// Speech-to-text with the browser's own speech recognition (the Web Speech API, no library), while
// the student speaks. Chrome and Edge send the sound to their own speech service for this; Safari
// uses Apple's. Where it's missing (Firefox, most Android WebViews) or fails, the student types what
// they said instead. Only the words ever go to Ekagra's AI, never the sound.

/** Uses the student's active browser locale for Web Speech recognition. */
export const SPEECH_LANG = browserLocale()

// The few parts of the Web Speech API used here (Chrome still names the class webkitSpeechRecognition).
interface RecognitionResult {
  readonly isFinal: boolean
  readonly [index: number]: { readonly transcript: string } | undefined
}
interface RecognitionEvent {
  readonly resultIndex: number
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResult | undefined }
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { readonly error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionClass = new () => Recognition

function recognitionClass(): RecognitionClass | null {
  if (typeof window === 'undefined') return null
  const speech = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition ?? null
}

export function canRecognizeSpeech(): boolean {
  return recognitionClass() !== null
}

export interface Listener {
  /** Stops listening and gives back everything heard (empty when nothing was). */
  stop: () => Promise<string>
  /** Stops without keeping anything. */
  cancel: () => void
}

/** After these, listening can't go on: no permission, no microphone, no speech service or no internet. */
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported'])
/** Browsers end listening after a pause; it starts again this many times at most. */
const MAX_RESTARTS = 30

function problemFor(error: string): string {
  if (error === 'network') return 'Speech-to-text needs the internet. After you stop, type what you said instead.'
  return "This browser couldn't turn your speech into text. After you stop, type what you said instead."
}

/**
 * Starts listening: `onText` gets everything heard so far as the student speaks, `onProblem` says
 * why it stopped working (the recording goes on). Null when the browser can't do it at all.
 */
export function startListening(onText: (text: string) => void, onProblem: (message: string) => void): Listener | null {
  const Recognition = recognitionClass()
  if (!Recognition) return null
  const recognition = new Recognition()
  recognition.lang = SPEECH_LANG
  recognition.continuous = true
  recognition.interimResults = true

  // Earlier runs, this run's finished phrases (by their index) and the phrase still being heard.
  let heard = ''
  let phrases: string[] = []
  let pending = ''
  let listening = true
  let ended = false
  let restarts = 0
  let done: ((text: string) => void) | null = null
  const all = () => joinSpeech([heard, ...phrases, pending])

  recognition.onresult = (event) => {
    pending = ''
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index]
      const words = result?.[0]?.transcript ?? ''
      if (result?.isFinal) phrases[index] = words
      else pending = joinSpeech([pending, words])
    }
    onText(all())
  }
  recognition.onerror = (event) => {
    if (!FATAL.has(event.error)) return
    listening = false
    onProblem(problemFor(event.error))
  }
  recognition.onend = () => {
    heard = joinSpeech([heard, ...phrases, pending])
    phrases = []
    pending = ''
    if (listening && restarts < MAX_RESTARTS) {
      restarts += 1
      try {
        recognition.start()
        return
      } catch {
        // It can't start again: keep what was heard.
      }
    }
    ended = true
    done?.(heard)
  }

  try {
    recognition.start()
  } catch {
    return null
  }

  return {
    stop: () =>
      new Promise<string>((resolve) => {
        listening = false
        if (ended) {
          resolve(heard)
          return
        }
        done = resolve
        try {
          recognition.stop()
        } catch {
          resolve(all())
        }
        // Some browsers never say they've ended: don't wait more than 2 seconds.
        window.setTimeout(() => resolve(all()), 2000)
      }),
    cancel: () => {
      listening = false
      done = null
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try {
        recognition.abort()
      } catch {
        // Already stopped.
      }
    },
  }
}
