import { useEffect, useRef, useState, type FormEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { CheckCircle2, Lightbulb, LoaderCircle, Mic, RotateCcw, Sparkles, Square, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { countLabel } from '@/features/academics/labels'
import { TrendChart } from '@/features/metrics/charts'
import { useNow } from '@/hooks/useNow'
import { useDataSource } from '@/lib/dataSource'
import { cn } from '@/lib/utils'
import { useLifeMutation } from '../lifeData'
import { canRecord, startRecording, toAudioFile, type Recorder, type Recording } from './recorder'
import {
  averageScore,
  clockLabel,
  deviceTips,
  fillerLabel,
  fillerLevel,
  GOOD_PACE,
  markFillers,
  PACE_LABEL,
  paceOf,
  practisedOn,
  progressSeries,
  promptAt,
  readFeedback,
  readFillers,
  readScores,
  SCENARIO_HINT,
  SCENARIO_LABEL,
  SCORE_LABEL,
  SPEAK_SCENARIOS,
  SPEAK_SCORES,
  speechStats,
  toScenario,
  topFillers,
  type Scenario,
  type SpeakingSession,
} from './speech'
import { deleteSpeakingSession, usePractiseWithAi, useSaveSpeakingSession, useSpeakingSessions } from './speakingData'

/** A recording stops by itself after 3 minutes. */
const MAX_SECONDS = 180

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Please try again.')
const nowMs = () => Date.now()

/** Life → Speaking: practise answering a question out loud, get feedback, and watch pace and fillers improve. */
export function SpeakingTab() {
  const now = useNow(60_000)
  const sessions = useSpeakingSessions()
  const [scenario, setScenario] = useState<Scenario>('interview')
  const [promptIndex, setPromptIndex] = useState(0)
  const [ownPrompt, setOwnPrompt] = useState<string | null>(null)
  const [shownId, setShownId] = useState<string | null>(null)
  const remove = useLifeMutation(deleteSpeakingSession)

  if (sessions.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  if (sessions.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {sessions.error.message}
      </p>
    )
  }
  const list = sessions.data ?? []
  const shown = list.find((session) => session.id === shownId) ?? null
  const prompt = ownPrompt === null ? promptAt(scenario, promptIndex) : ownPrompt.trim() || 'Free practice'

  return (
    <div className="grid gap-4">
      <PracticeCard
        scenario={scenario}
        onScenario={(next) => {
          setScenario(next)
          setPromptIndex(0)
          setOwnPrompt(null)
        }}
        prompt={prompt}
        ownPrompt={ownPrompt}
        onOwnPrompt={setOwnPrompt}
        onNextPrompt={() => {
          setOwnPrompt(null)
          setPromptIndex(promptIndex + 1)
        }}
        practisedSeconds={practisedOn(list, format(now, 'yyyy-MM-dd'))}
        onSaved={(session) => setShownId(session.id)}
      />
      {shown && <SessionCard session={shown} onClose={() => setShownId(null)} />}
      <ProgressCard sessions={list} />
      <HistoryCard
        sessions={list}
        shownId={shownId}
        busy={remove.isPending}
        onShow={setShownId}
        onDelete={(id) => remove.mutate(id, { onSuccess: () => setShownId((current) => (current === id ? null : current)) })}
      />
      {remove.error && (
        <p role="alert" className="text-sm text-destructive">
          {remove.error.message}
        </p>
      )}
    </div>
  )
}

function PracticeCard({
  scenario,
  onScenario,
  prompt,
  ownPrompt,
  onOwnPrompt,
  onNextPrompt,
  practisedSeconds,
  onSaved,
}: {
  scenario: Scenario
  onScenario: (scenario: Scenario) => void
  prompt: string
  ownPrompt: string | null
  onOwnPrompt: (text: string) => void
  onNextPrompt: () => void
  practisedSeconds: number
  onSaved: (session: SpeakingSession) => void
}) {
  const { source } = useDataSource()
  const withAi = source?.kind === 'supabase'
  const practise = usePractiseWithAi()
  const recorderRef = useRef<Recorder | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const aliveRef = useRef(true)
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording'>('idle')
  const [startedAt, setStartedAt] = useState(0)
  const [take, setTake] = useState<{ recording: Recording; url: string } | null>(null)
  const [typing, setTyping] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const now = useNow(phase === 'recording' ? 250 : 60_000)
  const elapsed = phase === 'recording' ? Math.max(0, (now.getTime() - startedAt) / 1000) : 0
  const recordable = canRecord()

  // Leaving the tab while recording turns the microphone off.
  useEffect(() => {
    const alive = aliveRef
    const recorder = recorderRef
    const timer = timerRef
    alive.current = true
    return () => {
      alive.current = false
      window.clearTimeout(timer.current)
      recorder.current?.cancel()
      recorder.current = null
    }
  }, [])

  // A take can be played back from memory; its address is freed when it's replaced or left.
  useEffect(() => {
    if (!take) return
    return () => URL.revokeObjectURL(take.url)
  }, [take])

  async function stop() {
    window.clearTimeout(timerRef.current)
    const recorder = recorderRef.current
    recorderRef.current = null
    if (!recorder) return
    try {
      const recording = await recorder.stop()
      setTake({ recording, url: URL.createObjectURL(recording.blob) })
    } catch (error) {
      setProblem(messageOf(error))
    } finally {
      setPhase('idle')
    }
  }

  async function start() {
    setProblem(null)
    setTake(null)
    setPhase('starting')
    try {
      const recorder = await startRecording()
      if (!aliveRef.current) {
        recorder.cancel()
        return
      }
      recorderRef.current = recorder
      setStartedAt(nowMs())
      setPhase('recording')
      timerRef.current = window.setTimeout(() => void stop(), MAX_SECONDS * 1000)
    } catch (error) {
      setPhase('idle')
      setProblem(messageOf(error))
    }
  }

  function cancel() {
    window.clearTimeout(timerRef.current)
    recorderRef.current?.cancel()
    recorderRef.current = null
    setPhase('idle')
  }

  async function getFeedback() {
    if (!take) return
    setProblem(null)
    try {
      const audio = await toAudioFile(take.recording)
      const session = await practise.mutateAsync({ scenario, prompt, durationSec: take.recording.durationSec, audio })
      // The recording is dropped here: only the transcript and the scores were saved.
      setTake(null)
      onSaved(session)
    } catch (error) {
      setProblem(messageOf(error))
    }
  }

  const busy = phase !== 'idle' || practise.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle>Speaking practice</CardTitle>
        <CardDescription>Today: {clockLabel(practisedSeconds)} of practice. A few minutes every day makes a big difference.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind of speech">
          {SPEAK_SCENARIOS.map((option) => (
            <Button key={option} size="sm" variant={option === scenario ? 'secondary' : 'outline'} aria-pressed={option === scenario} disabled={busy} onClick={() => onScenario(option)}>
              {SCENARIO_LABEL[option]}
            </Button>
          ))}
        </div>
        <div className="grid gap-2 rounded-lg bg-muted/40 p-3">
          {ownPrompt === null ? (
            <p className="font-heading text-lg font-semibold">{prompt}</p>
          ) : (
            <Label className="grid gap-1.5 font-normal">
              <span className="text-sm text-muted-foreground">Your own question or topic</span>
              <Input value={ownPrompt} maxLength={500} placeholder="e.g. Explain recursion to a friend" onChange={(event) => onOwnPrompt(event.target.value)} />
            </Label>
          )}
          <p className="text-sm text-muted-foreground">{SCENARIO_HINT[scenario]}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={onNextPrompt}>
              <RotateCcw aria-hidden />
              Another question
            </Button>
            {ownPrompt === null && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onOwnPrompt('')}>
                Write my own
              </Button>
            )}
          </div>
        </div>

        {phase === 'recording' ? (
          <div className="flex flex-wrap items-center gap-3">
            <span role="status" className="flex items-center gap-2 text-sm tabular-nums">
              <span className="size-2.5 animate-pulse rounded-full bg-destructive" aria-hidden />
              Recording {clockLabel(elapsed)} of {clockLabel(MAX_SECONDS)}
            </span>
            <Button onClick={() => void stop()}>
              <Square aria-hidden />
              Stop
            </Button>
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          </div>
        ) : take ? (
          <div className="grid gap-2">
            <audio controls src={take.url} className="w-full" aria-label="Your recording" />
            <div className="flex flex-wrap gap-2">
              {withAi && (
                <Button disabled={practise.isPending} onClick={() => void getFeedback()}>
                  {practise.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                  {practise.isPending ? 'Listening…' : 'Get feedback'}
                </Button>
              )}
              <Button variant="outline" disabled={practise.isPending} onClick={() => void start()}>
                <Mic aria-hidden />
                Record again
              </Button>
              <Button variant="ghost" disabled={practise.isPending} onClick={() => setTake(null)}>
                Discard
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button disabled={phase === 'starting' || !recordable} onClick={() => void start()}>
              {phase === 'starting' ? <LoaderCircle className="animate-spin" aria-hidden /> : <Mic aria-hidden />}
              Start speaking
            </Button>
            <Button variant="outline" aria-expanded={typing} onClick={() => setTyping(!typing)}>
              Type what I said
            </Button>
          </div>
        )}
        {!recordable && <p className="text-sm text-muted-foreground">This browser can't record audio: type what you said instead, or use the Android app.</p>}
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        {phase !== 'recording' && (typing || (take !== null && !withAi)) && (
          <TypedAnswer
            key={take?.url ?? 'typed'}
            scenario={scenario}
            prompt={prompt}
            seconds={take?.recording.durationSec ?? null}
            onSaved={(session) => {
              setTake(null)
              setTyping(false)
              onSaved(session)
            }}
          />
        )}
        <p className="text-xs text-muted-foreground">
          {withAi
            ? 'Your recording goes to the AI only for this feedback and is never saved: only the transcript and the scores are kept.'
            : 'Demo Mode has no AI to listen: your recording stays on this device for you to play back. Type what you said, and the app counts your pace and filler words.'}
        </p>
      </CardContent>
    </Card>
  )
}

/** A typed (or pasted) answer: pace and fillers are counted on the device, with tips from the numbers. */
function TypedAnswer({ scenario, prompt, seconds, onSaved }: { scenario: Scenario; prompt: string; seconds: number | null; onSaved: (session: SpeakingSession) => void }) {
  const [text, setText] = useState('')
  const [secondsText, setSecondsText] = useState(String(seconds ?? 60))
  const save = useSaveSpeakingSession()
  const durationSec = Math.round(Number(secondsText))
  const problem = !Number.isFinite(durationSec) || durationSec < 5 || durationSec > 1800 ? 'How long you spoke: between 5 and 1,800 seconds.' : null

  function submit(event: FormEvent) {
    event.preventDefault()
    if (problem) return
    const tips = deviceTips(speechStats(text, durationSec), durationSec)
    save.mutate({ scenario, prompt, durationSec, transcript: text, scores: null, feedback: tips.map((tip) => ({ kind: 'tip' as const, text: tip })), source: 'device' }, { onSuccess: onSaved })
  }

  return (
    <form className="grid gap-3 rounded-lg border p-3" onSubmit={submit}>
      <Label className="grid gap-1.5 font-normal">
        <span className="text-sm text-muted-foreground">What you said, as you said it (with every um and like)</span>
        <Textarea rows={4} maxLength={20_000} value={text} onChange={(event) => setText(event.target.value)} />
      </Label>
      <Label className="grid max-w-56 gap-1.5 font-normal">
        <span className="text-sm text-muted-foreground">How long you spoke (seconds)</span>
        <Input type="number" inputMode="numeric" min={5} max={1800} value={secondsText} onChange={(event) => setSecondsText(event.target.value)} />
      </Label>
      {(problem ?? save.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? save.error?.message}
        </p>
      )}
      <Button type="submit" className="justify-self-start" disabled={!text.trim() || problem !== null || save.isPending}>
        {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
        Count my pace and fillers
      </Button>
    </form>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg bg-muted/40 p-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-lg font-semibold tabular-nums">{value}</dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
  )
}

/** One session: pace, fillers, the AI's scores and tips, and the transcript with the fillers marked. */
function SessionCard({ session, onClose }: { session: SpeakingSession; onClose: () => void }) {
  const scores = readScores(session.scores)
  const feedback = readFeedback(session.feedback)
  const fillers = topFillers(readFillers(session.fillers))
  const wpm = Math.round(Number(session.wpm ?? 0))
  const perMinute = session.filler_count / (Math.max(1, session.duration_sec) / 60)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-start justify-between gap-2">
          <span>{session.prompt}</span>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
            <X aria-hidden />
          </Button>
        </CardTitle>
        <CardDescription>
          {SCENARIO_LABEL[toScenario(session.scenario)]} · {format(parseISO(session.created_at), 'EEE d MMM, HH:mm')} · {session.source === 'ai' ? 'feedback from the AI' : 'counted on your device'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <dl className="grid grid-cols-3 gap-2">
          <Tile label="Pace" value={String(wpm)} note={`words a minute: ${PACE_LABEL[paceOf(wpm)].toLowerCase()}`} />
          <Tile label="Filler words" value={String(session.filler_count)} note={`${perMinute.toFixed(1)} a minute: ${fillerLevel(perMinute)}`} />
          <Tile label="Words" value={String(session.words)} note={`in ${clockLabel(session.duration_sec)}`} />
        </dl>
        {fillers.length > 0 && <p className="text-muted-foreground">Fillers: {fillers.map(({ filler, count }) => `${fillerLabel(filler)} ×${count}`).join(' · ')}</p>}
        {scores && (
          <div className="grid gap-2">
            <p className="font-medium">
              Scores <span className="font-normal text-muted-foreground">(average {averageScore(scores)} out of 10)</span>
            </p>
            {SPEAK_SCORES.map((name) => (
              <div key={name} className="grid grid-cols-[6.5rem_1fr_1.5rem] items-center gap-2">
                <span className="text-muted-foreground">{SCORE_LABEL[name]}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${scores[name] * 10}%` }} />
                </div>
                <span className="text-right tabular-nums">{scores[name]}</span>
              </div>
            ))}
          </div>
        )}
        {feedback.length > 0 && (
          <ul className="grid gap-1.5">
            {feedback.map((item) => (
              <li key={`${item.kind}-${item.text}`} className="flex gap-2">
                {item.kind === 'strength' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-mode-life" aria-hidden /> : <Lightbulb className="mt-0.5 size-4 shrink-0 text-mode-hustle" aria-hidden />}
                <span>
                  <span className="sr-only">{item.kind === 'strength' ? 'Done well: ' : 'Tip: '}</span>
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        )}
        <details className="rounded-lg bg-muted/40 p-3">
          <summary className="cursor-pointer font-medium">Transcript, with the fillers marked</summary>
          <p className="mt-2 leading-relaxed whitespace-pre-wrap">
            {markFillers(session.transcript).map((piece, index) =>
              piece.filler ? (
                <mark key={index} className="rounded bg-mode-hustle/20 px-0.5 text-foreground">
                  {piece.text}
                </mark>
              ) : (
                <span key={index}>{piece.text}</span>
              ),
            )}
          </p>
        </details>
      </CardContent>
    </Card>
  )
}

function ProgressCard({ sessions }: { sessions: SpeakingSession[] }) {
  if (sessions.length === 0) return null
  if (sessions.length === 1) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progress</CardTitle>
          <CardDescription>After your next session, your pace and filler words show here over time.</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  const series = progressSeries(sessions)
  const firstLabel = series.from ? format(parseISO(series.from), 'd MMM') : ''
  const count = series.wpm.length
  const lastWpm = series.wpm[count - 1] ?? 0
  const lastFillers = series.fillersPerMinute[count - 1] ?? 0
  const scored = series.score.filter((value) => value !== null).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Progress</CardTitle>
        <CardDescription>Your last {count} sessions, oldest first.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-1.5">
          <p className="text-sm font-medium">Pace, in words a minute</p>
          <TrendChart
            label={`Pace over your last ${count} sessions: ${lastWpm} words a minute in the latest`}
            values={series.wpm}
            range={[Math.min(80, ...series.wpm), Math.max(200, ...series.wpm)]}
            band={[GOOD_PACE.min, GOOD_PACE.max]}
            format={(value) => String(Math.round(value))}
            firstLabel={firstLabel}
            lastLabel="Latest"
          />
          <p className="text-xs text-muted-foreground">
            The shaded band ({GOOD_PACE.min}–{GOOD_PACE.max}) is a comfortable pace for interviews and talks.
          </p>
        </div>
        <div className="grid gap-1.5">
          <p className="text-sm font-medium">Filler words a minute</p>
          <TrendChart
            label={`Filler words a minute over your last ${count} sessions: ${lastFillers} in the latest`}
            values={series.fillersPerMinute}
            range={[0, Math.max(6, ...series.fillersPerMinute)]}
            target={2}
            format={(value) => value.toFixed(1)}
            firstLabel={firstLabel}
            lastLabel="Latest"
          />
          <p className="text-xs text-muted-foreground">Aim for 2 or fewer a minute (the dashed line).</p>
        </div>
        {scored >= 2 && (
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">AI score, the average of the 4</p>
            <TrendChart
              label={`Average AI score over your last ${count} sessions`}
              values={series.score}
              range={[1, 10]}
              format={(value) => value.toFixed(1)}
              firstLabel={firstLabel}
              lastLabel="Latest"
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function HistoryCard({
  sessions,
  shownId,
  busy,
  onShow,
  onDelete,
}: {
  sessions: SpeakingSession[]
  shownId: string | null
  busy: boolean
  onShow: (id: string) => void
  onDelete: (id: string) => void
}) {
  if (sessions.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Past sessions</CardTitle>
        <CardDescription>Tap one to see its feedback and transcript.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-1.5 text-sm">
          {sessions.slice(0, 10).map((session) => {
            const scores = readScores(session.scores)
            return (
              <li key={session.id} className="flex items-center justify-between gap-2 border-t pt-1.5 first:border-t-0 first:pt-0">
                <button type="button" className={cn('min-w-0 flex-1 text-left', session.id === shownId && 'font-medium')} aria-current={session.id === shownId} onClick={() => onShow(session.id)}>
                  <span className="block truncate">{session.prompt}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {format(parseISO(session.created_at), 'd MMM')} · {SCENARIO_LABEL[toScenario(session.scenario)]} · {Math.round(Number(session.wpm ?? 0))} words a minute ·{' '}
                    {countLabel(session.filler_count, 'filler')}
                    {scores ? ` · ${averageScore(scores)}/10` : ''}
                  </span>
                </button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete the session "${session.prompt}"`} disabled={busy} onClick={() => onDelete(session.id)}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
