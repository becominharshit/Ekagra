import { MAX_AUDIO_BYTES, type AudioFile } from '@shared/schemas.ts'
import { audioType } from './speech'

// Recording from the microphone with the browser's own MediaRecorder (no library). The recording
// stays in memory: it can be played back, is sent once for feedback, then dropped. Never saved.
// On Android the WebView asks for the microphone permission the first time.

/** Formats to record in, best first: WebM/Opus (Chrome, Android), Ogg (Firefox), MP4 (Safari). */
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
/** Plenty for speech, and small: 3 minutes is about 0.7 MB. */
const BITS_PER_SECOND = 32_000

export interface Recording {
  blob: Blob
  mimeType: string
  durationSec: number
}

export interface Recorder {
  stop: () => Promise<Recording>
  /** Stops without keeping anything. */
  cancel: () => void
}

export function canRecord(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof MediaRecorder !== 'undefined'
}

function micProblem(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'The microphone is blocked. Allow it for Ekagra (on Android: Settings → Apps → Ekagra → Permissions → Microphone) and try again.'
  }
  if (name === 'NotFoundError') return 'No microphone was found on this device.'
  if (name === 'NotReadableError') return 'Another app is using the microphone. Close it and try again.'
  return "Couldn't start the microphone. Please try again."
}

export async function startRecording(): Promise<Recorder> {
  if (!canRecord()) throw new Error("This browser can't record audio. Try Chrome, or the Android app.")
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  } catch (error) {
    throw new Error(micProblem(error))
  }
  const release = () => stream.getTracks().forEach((track) => track.stop())
  const mimeType = TYPES.find((type) => MediaRecorder.isTypeSupported(type))
  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: BITS_PER_SECOND })
  } catch {
    release()
    throw new Error("This browser can't record audio. Try Chrome, or the Android app.")
  }
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  const startedAt = Date.now()
  recorder.start(1000)

  return {
    stop: () =>
      new Promise<Recording>((resolve, reject) => {
        recorder.onstop = () => {
          release()
          const type = recorder.mimeType || mimeType || 'audio/webm'
          resolve({ blob: new Blob(chunks, { type }), mimeType: type, durationSec: Math.max(1, Math.round((Date.now() - startedAt) / 1000)) })
        }
        recorder.onerror = () => {
          release()
          reject(new Error('The recording stopped unexpectedly. Please try again.'))
        }
        if (recorder.state === 'inactive') reject(new Error('The recording had already stopped.'))
        else recorder.stop()
      }),
    cancel: () => {
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
  }
}

/** A recording as base64 for ai-speak. Throws a plain-language error if it can't be sent. */
export async function toAudioFile(recording: Recording): Promise<AudioFile> {
  const mimeType = audioType(recording.mimeType)
  if (!mimeType) throw new Error("This browser records in a format the AI can't read. Try Chrome, or the Android app.")
  if (recording.blob.size > MAX_AUDIO_BYTES) throw new Error('That recording is too long to send. Keep answers under 3 minutes.')
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Couldn't read the recording. Please try again."))
    reader.readAsDataURL(recording.blob)
  })
  return { mimeType, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) }
}
