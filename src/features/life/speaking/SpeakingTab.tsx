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
import { canRecognizeSpeech, startListening, type Listener } from './recognizer'
import { canRecord, startRecording, type Recorder, type Recording } from './recorder'
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
  type Capture,
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
  const save = useSaveSpeakingSession()
  const recorderRef = useRef<Recorder | null>(null)
  const listenerRef = useRef<Listener | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const aliveRef = useRef(true)
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording'>('idle')
  const [startedAt, setStartedAt] = useState(0)
  const [take, setTake] = useState<{ recording: Recording; url: string; heard: string } | null>(null)
  const [heard, setHeard] = useState('')
  const [speechProblem, setSpeechProblem] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const now = useNow(phase === 'recording' ? 250 : 60_000)
  const elapsed = phase === 'recording' ? Math.max(0, (now.getTime() - startedAt) / 1000) : 0
  const recordable = canRecord()
  // Speech-to-text only when signed in: in Chrome it goes through Google's speech service, and in
  // Demo Mode nothing leaves the device.
  const listens = withAi && canRecognizeSpeech()
  const sending = practise.isPending ? 'ai' : save.isPending ? 'device' : null

  // Leaving the tab while recording turns the microphone off.
  useEffect(() => {
    const alive = aliveRef
    const recorder = recorderRef
    const listener = listenerRef
    const timer = timerRef
    alive.current = true
    return () => {
      alive.current = false
      window.clearTimeout(timer.current)
      recorder.current?.cancel()
      recorder.current = null
      listener.current?.cancel()
      listener.current = null
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
    const listener = listenerRef.current
    recorderRef.current = null
    listenerRef.current = null
    if (!recorder) return
    try {
      const [recording, words] = await Promise.all([recorder.stop(), listener ? listener.stop() : Promise.resolve('')])
      setTake({ recording, url: URL.createObjectURL(recording.blob), heard: words })
    } catch (error) {
      listener?.cancel()
      setProblem(messageOf(error))
    } finally {
      setPhase('idle')
    }
  }

  async function start() {
    setProblem(null)
    setSpeechProblem(null)
    setTake(null)
    setTyping(false)
    setHeard('')
    practise.reset()
    save.reset()
    setPhase('starting')
    try {
      const recorder = await startRecording()
      if (!aliveRef.current) {
        recorder.cancel()
        return
      }
      recorderRef.current = recorder
      if (listens) listenerRef.current = startListening(setHeard, setSpeechProblem)
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
    listenerRef.current?.cancel()
    listenerRef.current = null
    setHeard('')
    setPhase('idle')
  }

  /** Feedback from the AI on the words (signed in), or the pace and fillers counted on the device. */
  function send(how: 'ai' | 'device', answer: { transcript: string; durationSec: number; captured: Capture }) {
    setProblem(null)
    // The recording is dropped here: only the words, what was counted and the scores are kept.
    const done = (session: SpeakingSession) => {
      setTake(null)
      setTyping(false)
      onSaved(session)
    }
    if (how === 'ai') {
      practise.mutate({ scenario, prompt, ...answer }, { onSuccess: done })
      return
    }
    const tips = deviceTips(speechStats(answer.transcript, answer.durationSec), answer.durationSec)
    save.mutate(
      { scenario, prompt, durationSec: answer.durationSec, transcript: answer.transcript, scores: null, feedback: tips.map((tip) => ({ kind: 'tip' as const, text: tip })), source: 'device' },
      { onSuccess: done },
    )
  }

  const busy = phase !== 'idle' || sending !== null

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
          <div className="grid gap-2">
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
            {listens && !speechProblem && <p className="rounded-lg bg-muted/40 p-2.5 text-sm text-muted-foreground">{heard || 'Listening… your words show here as you speak.'}</p>}
          </div>
        ) : take ? (
          <div className="grid gap-2">
            <audio controls src={take.url} className="w-full" aria-label="Your recording" />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={sending !== null} onClick={() => void start()}>
                <Mic aria-hidden />
                Record again
              </Button>
              <Button variant="ghost" disabled={sending !== null} onClick={() => setTake(null)}>
                Discard
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button disabled={phase === 'starting' || !recordable || sending !== null} onClick={() => void start()}>
              {phase === 'starting' ? <LoaderCircle className="animate-spin" aria-hidden /> : <Mic aria-hidden />}
              Start speaking
            </Button>
            <Button variant="outline" aria-expanded={typing} disabled={sending !== null} onClick={() => setTyping(!typing)}>
              Type what I said
            </Button>
          </div>
        )}
        {!recordable && <p className="text-sm text-muted-foreground">This browser can't record audio: type what you said instead, or use the Android app.</p>}
        {recordable && withAi && !listens && phase === 'idle' && !take && (
          <p className="text-sm text-muted-foreground">This browser can't turn speech into text: after you stop, type what you said (you can play your recording back).</p>
        )}
        {speechProblem && (
          <p role="status" className="text-sm text-muted-foreground">
            {speechProblem}
          </p>
        )}
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        {phase !== 'recording' && (typing || take !== null) && (
          <AnswerForm
            key={take?.url ?? 'typed'}
            heard={take?.heard ?? ''}
            seconds={take?.recording.durationSec ?? null}
            withAi={withAi}
            sending={sending}
            error={(practise.error ?? save.error)?.message ?? null}
            onSend={send}
          />
        )}
        <p className="text-xs text-muted-foreground">
          {withAi
            ? `Only the words go to the AI for feedback: your recording stays on this device and is never sent or saved.${listens ? ' Speech-to-text is done by your browser (Chrome and Edge use their online speech service).' : ''}`
            : 'Demo Mode has no AI: your recording stays on this device for you to play back. Type what you said, and the app counts your pace and filler words.'}
        </p>
      </CardContent>
    </Card>
  )
}

/**
 * What was said - as speech-to-text heard it, or typed - for the student to check, then feedback
 * from the AI (signed in) or the pace and fillers counted on the device, with tips from the numbers.
 */
function AnswerForm({
  heard,
  seconds,
  withAi,
  sending,
  error,
  onSend,
}: {
  heard: string
  seconds: number | null
  withAi: boolean
  sending: 'ai' | 'device' | null
  error: string | null
  onSend: (how: 'ai' | 'device', answer: { transcript: string; durationSec: number; captured: Capture }) => void
}) {
  const [text, setText] = useState(heard)
  const [secondsText, setSecondsText] = useState(String(seconds ?? 60))
  const durationSec = Math.round(Number(secondsText))
  const problem = !Number.isFinite(durationSec) || durationSec < 5 || durationSec > 1800 ? 'How long you spoke: between 5 and 1,800 seconds.' : null
  const ready = text.trim() !== '' && problem === null && sending === null
  const captured: Capture = heard.trim() ? 'speech' : 'typed'

  function send(how: 'ai' | 'device') {
    if (ready) onSend(how, { transcript: text, durationSec, captured })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    send(withAi ? 'ai' : 'device')
  }

  return (
    <form className="grid gap-3 rounded-lg border p-3" onSubmit={submit}>
      <Label className="grid gap-1.5 font-normal">
        <span className="text-sm text-muted-foreground">
          {heard ? 'What you said, as speech-to-text heard it: fix any wrong words, and add any um or uh it left out' : 'What you said, as you said it (with every um and like)'}
        </span>
        <Textarea rows={4} maxLength={20_000} value={text} onChange={(event) => setText(event.target.value)} />
      </Label>
      <Label className="grid max-w-56 gap-1.5 font-normal">
        <span className="text-sm text-muted-foreground">How long you spoke (seconds)</span>
        <Input type="number" inputMode="numeric" min={5} max={1800} value={secondsText} onChange={(event) => setSecondsText(event.target.value)} />
      </Label>
      {(problem ?? error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {withAi && (
          <Button type="submit" disabled={!ready}>
            {sending === 'ai' ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {sending === 'ai' ? 'Getting feedback…' : 'Get feedback'}
          </Button>
        )}
        <Button type={withAi ? 'button' : 'submit'} variant={withAi ? 'outline' : 'default'} disabled={!ready} onClick={withAi ? () => send('device') : undefined}>
          {sending === 'device' && <LoaderCircle className="animate-spin" aria-hidden />}
          Count my pace and fillers
        </Button>
      </div>
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
