import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Headphones, Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { buildTwoHostDialogue, formatDialogueTranscript, type DialogueTurn } from './audioSummary'

const SPEEDS = [1, 1.25, 1.5] as const

function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

function pickVoice(speaker: DialogueTurn['speaker']): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('en'))
  if (voices.length === 0) return null
  if (speaker === 'Alex') return voices[0] ?? null
  return voices[1] ?? voices[0] ?? null
}

/** Generates and plays an alternating 2-host audio summary via Web Speech Synthesis with live transcript. */
export function AudioSummaryPlayer({ title, content }: { title: string; content: string }) {
  const turns = useMemo(() => buildTwoHostDialogue(title, content), [title, content])
  const [activeIndex, setActiveIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [rate, setRate] = useState<(typeof SPEEDS)[number]>(1)
  const runIdRef = useRef(0)
  const supported = speechSupported()

  useEffect(() => {
    return () => {
      runIdRef.current += 1
      if (speechSupported()) window.speechSynthesis.cancel()
    }
  }, [title, content])

  function stopPlayback() {
    runIdRef.current += 1
    if (supported) window.speechSynthesis.cancel()
    setPlaying(false)
    setPaused(false)
    setActiveIndex(0)
  }

  function speakFrom(index: number, nextRate = rate) {
    if (!supported) {
      setActiveIndex(Math.min(Math.max(0, index), Math.max(0, turns.length - 1)))
      return
    }
    const turn = turns[index]
    if (!turn) {
      stopPlayback()
      return
    }
    const runId = ++runIdRef.current
    window.speechSynthesis.cancel()
    setActiveIndex(index)
    setPlaying(true)
    setPaused(false)

    const utterance = new SpeechSynthesisUtterance(turn.text)
    const voice = pickVoice(turn.speaker)
    if (voice) utterance.voice = voice
    utterance.pitch = turn.speaker === 'Alex' ? 0.95 : 1.08
    utterance.rate = nextRate
    utterance.onend = () => {
      if (runIdRef.current !== runId) return
      if (index + 1 < turns.length) {
        speakFrom(index + 1, nextRate)
      } else {
        setPlaying(false)
        setPaused(false)
        setActiveIndex(0)
      }
    }
    utterance.onerror = () => {
      if (runIdRef.current !== runId) return
      setPlaying(false)
      setPaused(false)
    }
    window.speechSynthesis.speak(utterance)
  }

  function togglePlayPause() {
    if (!supported) return
    if (playing && !paused) {
      window.speechSynthesis.pause()
      setPaused(true)
      return
    }
    if (playing && paused) {
      window.speechSynthesis.resume()
      setPaused(false)
      return
    }
    speakFrom(activeIndex)
  }

  function cycleRate() {
    const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length] ?? 1
    setRate(next)
    if (playing && !paused) speakFrom(activeIndex, next)
  }

  function downloadScript() {
    const text = formatDialogueTranscript(title, turns)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'study-note'}-audio-summary.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="max-w-3xl border-studio/30 bg-muted/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Headphones className="size-4 text-studio" aria-hidden />
              2-Host Audio Summary
            </CardTitle>
            <CardDescription>Hosts Alex &amp; Maya break down the note into a conversational study recap.</CardDescription>
          </div>
          <Badge variant="outline" className="tabular-nums">
            Turn {activeIndex + 1} / {turns.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {supported && (
            <>
              <Button type="button" size="sm" onClick={togglePlayPause}>
                {playing && !paused ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
                {playing && !paused ? 'Pause' : paused ? 'Resume' : 'Play'}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={activeIndex === 0} onClick={() => speakFrom(Math.max(0, activeIndex - 1))}>
                <SkipBack className="size-3.5" aria-hidden />
                Prev
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={activeIndex >= turns.length - 1} onClick={() => speakFrom(Math.min(turns.length - 1, activeIndex + 1))}>
                <SkipForward className="size-3.5" aria-hidden />
                Next
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!playing && activeIndex === 0} onClick={stopPlayback}>
                <Square className="size-3.5" aria-hidden />
                Stop
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={cycleRate}>
                {rate}x
              </Button>
            </>
          )}
          <Button type="button" size="sm" variant="outline" onClick={downloadScript}>
            <Download className="size-3.5" aria-hidden />
            Transcript (.txt)
          </Button>
        </div>

        {!supported && (
          <p className="text-xs text-muted-foreground">
            Speech synthesis is not available in this browser — read or download the 2-host dialogue script below.
          </p>
        )}

        <ol className="grid max-h-72 gap-2 overflow-y-auto pr-1 text-sm">
          {turns.map((turn, index) => {
            const isActive = index === activeIndex
            return (
              <li key={turn.id}>
                <button
                  type="button"
                  onClick={() => speakFrom(index)}
                  className={cn(
                    'flex w-full flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors',
                    isActive ? 'border-primary bg-background shadow-xs' : 'border-transparent bg-background/60 hover:bg-background',
                  )}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant={turn.speaker === 'Alex' ? 'default' : 'secondary'}>{turn.speaker}</Badge>
                    {turn.heading && <span className="font-medium text-muted-foreground">{turn.heading}</span>}
                  </div>
                  <p className="leading-relaxed text-foreground">{turn.text}</p>
                </button>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
