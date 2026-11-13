import { useState } from 'react'
import { CheckCircle2, Code2, Layers, LockOpen, RefreshCw, ShieldAlert } from 'lucide-react'
import { createEmptyCard, fsrs, Rating, type Grade } from 'ts-fsrs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface PreviewChallenge {
  id: string
  kind: 'fsrs' | 'code'
  badge: string
  appBlocked: string
  prompt: string
  codeSnippet?: string
  options: readonly [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
  explanation: string
}

const PREVIEW_CHALLENGES: PreviewChallenge[] = [
  {
    id: 'algorithms-fsrs',
    kind: 'fsrs',
    badge: 'FSRS Active Recall',
    appBlocked: 'YouTube / Instagram Pause',
    prompt: 'What is the amortized time complexity of searching a balanced binary search tree (AVL or Red-Black)?',
    options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
    correctIndex: 1,
    explanation: 'Balanced height stays proportional to log2(n), bounding comparisons along a single root-to-leaf path.',
  },
  {
    id: 'python-debug',
    kind: 'code',
    badge: 'Code Debug Check',
    appBlocked: 'Reddit / Shorts Gate',
    prompt: 'Which fix stops this binary search helper from skipping the target or looping forever?',
    codeSnippet: [
      'def search(nums, target):',
      '    lo, hi = 0, len(nums) - 1',
      '    while lo < hi:  # <-- bug here',
      '        mid = (lo + hi) // 2',
      '        if nums[mid] == target: return mid',
      '        if nums[mid] < target: lo = mid + 1',
      '        else: hi = mid - 1',
      '    return -1',
    ].join('\n'),
    options: [
      'Change `while lo < hi:` to `while lo <= hi:`',
      'Set `hi = len(nums) + 1` initially',
      'Change `(lo + hi) // 2` to `(lo + hi) * 2`',
      'Always return `lo` instead of `-1`',
    ],
    correctIndex: 0,
    explanation: 'With closed bounds `[lo, hi]`, `lo == hi` still holds one unchecked element and must run inside the loop.',
  },
]

const fsrsScheduler = fsrs({ enable_fuzz: false })

function nextIntervalDays(grade: Grade): number {
  const scheduled = fsrsScheduler.repeat(createEmptyCard(new Date('2026-11-13T12:00:00Z')), new Date('2026-11-13T12:00:00Z'))
  return scheduled[grade].card.scheduled_days
}

/**
 * Interactive zero-login Academic Tollbooth preview for the public landing page.
 * Lets prospective students test FSRS-backed active recall & code debugging before signing in.
 */
export function PublicTollboothPreview() {
  const [challengeIndex, setChallengeIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [unlocked, setUnlocked] = useState(false)

  const challenge = PREVIEW_CHALLENGES[challengeIndex]!

  function chooseChallenge(nextIndex: number) {
    setChallengeIndex(nextIndex)
    setSelected(null)
    setUnlocked(false)
  }

  function handleOption(index: number) {
    setSelected(index)
    setUnlocked(index === challenge.correctIndex)
  }

  const goodDays = nextIntervalDays(Rating.Good)

  return (
    <section aria-labelledby="tollbooth-preview-heading" className="pb-10">
      <Card className="border-foreground/10 bg-background/85 shadow-sm backdrop-blur">
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <ShieldAlert className="size-3" aria-hidden />
                Try before you sign in
              </Badge>
              <Badge variant="outline">{challenge.appBlocked}</Badge>
            </div>
            <CardTitle className="font-heading text-xl">
              <h2 id="tollbooth-preview-heading">Academic Tollbooth Preview</h2>
            </CardTitle>
            <CardDescription>
              Instead of a dead-end wall, FocusGuard and the desktop blocker unlock a short break once you pass one due FSRS recall or code debug check.
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-1.5" role="tablist" aria-label="Sample challenge type">
            {PREVIEW_CHALLENGES.map((item, idx) => (
              <Button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={challengeIndex === idx}
                size="sm"
                variant={challengeIndex === idx ? 'default' : 'outline'}
                onClick={() => chooseChallenge(idx)}
              >
                {item.kind === 'fsrs' ? <Layers className="size-3.5" aria-hidden /> : <Code2 className="size-3.5" aria-hidden />}
                {item.kind === 'fsrs' ? 'FSRS Card' : 'Code Debug'}
              </Button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="grid gap-4">
          <p className="text-sm font-medium text-foreground">{challenge.prompt}</p>

          {challenge.codeSnippet && (
            <pre className="overflow-x-auto rounded-lg border bg-muted/60 p-3 font-mono text-xs leading-relaxed text-foreground">
              <code>{challenge.codeSnippet}</code>
            </pre>
          )}

          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Answer choices">
            {challenge.options.map((option, idx) => {
              const isSelected = selected === idx
              const isRight = idx === challenge.correctIndex
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleOption(idx)}
                  aria-pressed={isSelected}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected && isRight && 'border-emerald-600 bg-emerald-500/10 text-foreground',
                    isSelected && !isRight && 'border-destructive bg-destructive/10 text-foreground',
                    !isSelected && 'hover:bg-accent/60',
                  )}
                >
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded border text-xs font-medium">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span>{option}</span>
                </button>
              )
            })}
          </div>

          {selected !== null && (
            <div
              role="status"
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-sm',
                unlocked ? 'border-emerald-600/40 bg-emerald-500/10' : 'border-destructive/40 bg-destructive/10',
              )}
            >
              <div className="flex items-start gap-2.5">
                {unlocked ? (
                  <LockOpen className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                )}
                <div className="grid gap-0.5">
                  <p className="font-medium">
                    {unlocked
                      ? `Pass earned — break unlocked! FSRS schedules next review in ${goodDays} day${goodDays === 1 ? '' : 's'}.`
                      : 'Not quite — try another option to unlock.'}
                  </p>
                  <p className="text-xs text-muted-foreground">{challenge.explanation}</p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => chooseChallenge((challengeIndex + 1) % PREVIEW_CHALLENGES.length)}
              >
                <RefreshCw className="size-3.5" aria-hidden />
                Try next check
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
