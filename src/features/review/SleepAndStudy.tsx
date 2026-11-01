import { Moon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { countLabel, minutesLabel } from '@/features/academics/labels'
import { regularityLabel, SLEEP_AIM } from '@/features/life/health/health'
import { RESTED_MINUTES, type SleepWeek, type StudyAfterSleep } from './weekStats'

const HOURS = RESTED_MINUTES / 60
const percent = (share: number | null) => (share === null ? '–' : `${Math.round(share * 100)}%`)

const ROWS: { label: string; value: (study: StudyAfterSleep) => string }[] = [
  { label: 'Days', value: (study) => String(study.days) },
  { label: 'Focus a day', value: (study) => (study.focusMinutes === null ? '–' : minutesLabel(Math.round(study.focusMinutes))) },
  { label: 'Answers right', value: (study) => (study.attempts > 0 ? `${percent(study.accuracy)} of ${study.attempts}` : '–') },
]

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg bg-muted/40 p-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-lg font-semibold tabular-nums">{value}</dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
  )
}

/** The review's sleep: this week's nights, and study on the days after rested and short nights over the last 4 weeks. */
export function SleepAndStudy({ sleep }: { sleep: SleepWeek }) {
  const { rested, short } = sleep.vsStudy
  const compared = rested.days + short.days > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Moon className="size-4" aria-hidden />
          Sleep and study
        </CardTitle>
        <CardDescription>
          {sleep.nights > 0
            ? `${countLabel(sleep.nights, 'night')} logged this week, and how you studied after rested and short nights.`
            : 'No nights logged this week. Log your sleep (or bring it in from Health Connect in the Android app) to see how it affects your focus and answers.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {sleep.nights > 0 && (
          <dl className="grid grid-cols-3 gap-2">
            <Tile label="Average sleep" value={sleep.avgMinutes === null ? '–' : minutesLabel(sleep.avgMinutes)} note={`Most people need ${SLEEP_AIM.min}–${SLEEP_AIM.max} h`} />
            <Tile label="Regularity" value={sleep.regularity === null ? '–' : `${sleep.regularity}/100`} note={sleep.regularity === null ? 'Needs 3 nights' : regularityLabel(sleep.regularity)} />
            <Tile label="Short nights" value={`${sleep.shortNights} of ${sleep.nights}`} note={`Under ${HOURS} hours`} />
          </dl>
        )}
        {compared && (
          <section className="grid gap-2" aria-label="Study after rested and short nights">
            <h3 className="font-medium">The day after, over the last 4 weeks</h3>
            <table className="w-full">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="pb-1 text-left font-normal">
                    <span className="sr-only">Study</span>
                  </th>
                  <th scope="col" className="pb-1 text-right font-normal">
                    {HOURS}+ hours of sleep
                  </th>
                  <th scope="col" className="pb-1 pl-2 text-right font-normal">
                    Under {HOURS} hours
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className="border-t">
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                      {row.label}
                    </th>
                    <td className="py-1.5 text-right tabular-nums">{row.value(rested)}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{row.value(short)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground">
              {rested.days === 0 || short.days === 0 ? 'Only one kind of night so far, so nothing to compare yet. ' : ''}A pattern in your own numbers, not proof: other things change from day to
              day too. Not medical advice.
            </p>
          </section>
        )}
        {sleep.nights === 0 && (
          <Button asChild variant="outline" className="justify-self-start">
            <Link to="/life/health">Log sleep</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
