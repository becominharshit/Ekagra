import { useState } from 'react'
import { ArrowRight, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useStudy } from '@/features/academics/roadmap'
import { ClassesToday } from '@/features/attendance/ClassesToday'
import { CrashButton, DayStatus } from '@/features/checkins/DayStatus'
import { EveningCheckIn } from '@/features/checkins/EveningCheckIn'
import { useFlashcards } from '@/features/flashcards/flashcards'
import { useMistakes } from '@/features/mistakes/mistakes'
import { DayTimeline } from '@/features/planner/DayTimeline'
import { useBlocks } from '@/features/planner/planBlocks'
import { localDateOf } from '@/features/planner/schedule'
import { ReviewTodayCard } from '@/features/review/ReviewNudges'
import { GroupFocusTodayCard } from '@/features/social/GroupFocusTodayCard'
import { NudgesCard } from '@/features/social/NudgesCard'
import { DueSoon } from '@/features/today/DueSoon'
import { MorningBrief } from '@/features/today/MorningBrief'
import { NowCard, UpNext } from '@/features/today/NowCard'
import { pickQuickWin, QUICK_WIN_MINUTES, type QuickWinMinutes } from '@/features/today/quickWin'
import { useNow, useTimezone } from '@/hooks/useNow'
import { formatLongDateInTimezone } from '@/lib/timezone'

export function TodayPage() {
  const { t } = useTranslation('common')
  const now = useNow(60_000)
  const timeZone = useTimezone()

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title={t('today.title')} subtitle={formatLongDateInTimezone(now, timeZone)} />
        <CrashButton />
      </div>
      <div className="grid gap-4">
        <DayStatus />
        <MorningBrief />
        <NowCard />
        <QuickWinCard now={now} timeZone={timeZone} />
        <ReviewTodayCard />
        <NudgesCard />
        <GroupFocusTodayCard />
        <ClassesToday />
        <EveningCheckIn />
        <UpNext />
        <DueSoon />
        <DayTimeline />
      </div>
    </>
  )
}

function QuickWinCard({ now, timeZone }: { now: Date; timeZone: string }) {
  const { t } = useTranslation('common')
  const [minutes, setMinutes] = useState<QuickWinMinutes | null>(null)
  const today = localDateOf(now, timeZone)
  const cards = useFlashcards()
  const mistakes = useMistakes()
  const blocks = useBlocks(today, today)
  const study = useStudy()

  const dueCards = (cards.data ?? []).filter((card) => !card.suspended && Date.parse(card.due_at) <= now.getTime()).length
  const dueMistakes = (mistakes.data ?? []).filter(
    (mistake) => mistake.status === 'open' && (!mistake.next_review_at || Date.parse(mistake.next_review_at) <= now.getTime()),
  ).length
  const suggestion = minutes
    ? pickQuickWin(minutes, {
        dueCards,
        dueMistakes,
        blocks: blocks.data ?? [],
        topics: study.data?.topics ?? [],
      })
    : null

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="size-4 text-mode-study" aria-hidden />
          {t('today.quickWinTitle')}
        </CardTitle>
        <CardDescription>{t('today.quickWinDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('today.spareTimeLabel')}>
          {QUICK_WIN_MINUTES.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={minutes === option ? 'default' : 'outline'}
              aria-pressed={minutes === option}
              onClick={() => setMinutes(minutes === option ? null : option)}
            >
              {t('today.minutesOption', { minutes: option })}
            </Button>
          ))}
        </div>
        {suggestion && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
            <div className="grid min-w-0 gap-0.5">
              <p className="text-sm font-medium">{suggestion.title}</p>
              <p className="text-xs text-muted-foreground">{suggestion.detail}</p>
            </div>
            <Button asChild size="sm">
              <Link to={suggestion.to}>
                {suggestion.actionLabel}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
