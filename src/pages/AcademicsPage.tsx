import { useState } from 'react'
import { BookOpen, CalendarCheck, ChevronRight, Code2, FileUp, FlaskConical, GraduationCap, Library, LoaderCircle, Plus, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { countLabel, examLabel, minutesLabel } from '@/features/academics/labels'
import { useStudy } from '@/features/academics/roadmap'
import { addSampleSubjects } from '@/features/academics/sampleSubjects'
import { SubjectDialog } from '@/features/academics/SubjectDialog'
import { useAcademicsMutation, useSubjects } from '@/features/academics/subjects'
import { priorityLabels } from '@/features/academics/topicTree'
import { PracticeCard } from '@/features/academics/PracticeCard'
import { useAuthStore } from '@/features/auth/authStore'
import { useInboxStore } from '@/features/inbox/inboxStore'
import { examReadiness, percentText } from '@/features/metrics/readiness'
import { ShareBar } from '@/features/metrics/ReadinessCard'
import { useLatestMocks } from '@/features/mock/mockTest'
import { DEFAULT_SKILL_WEEKLY_MINUTES } from '@/features/planner/studyData'
import { useNow, useTimezone } from '@/hooks/useNow'
import { dateKeyInTimezone } from '@/lib/timezone'

export function AcademicsPage() {
  const { t } = useTranslation('academics')
  const navigate = useNavigate()
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const subjects = useSubjects()
  const study = useStudy()
  const mocks = useLatestMocks()
  const [adding, setAdding] = useState(false)
  const showInbox = useInboxStore((state) => state.show)
  const now = useNow(60_000)
  const timeZone = useTimezone()
  const today = dateKeyInTimezone(now, timeZone)
  const samples = useAcademicsMutation<void, void>((source) => addSampleSubjects(source, today))

  const topicsOf = (subjectId: string) =>
    study.data?.topics.filter((topic) => topic.subject_id === subjectId && topic.parent_id !== null) ?? []

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {t('actions.addSubject')}
          </Button>
          <Button variant="outline" onClick={() => showInbox()}>
            <FileUp aria-hidden />
            {t('actions.addFile')}
          </Button>
          <Button asChild variant="outline">
            <Link to="/academics/library">
              <Library aria-hidden />
              {t('actions.library')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/academics/code">
              <Code2 aria-hidden />
              {t('actions.codingLab')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/academics/attendance">
              <CalendarCheck aria-hidden />
              {t('actions.attendance')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/academics/grades">
              <GraduationCap aria-hidden />
              {t('actions.grades')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/academics/progress">
              <TrendingUp aria-hidden />
              {t('actions.progress')}
            </Link>
          </Button>
        </div>

        <PracticeCard now={now} />

        {subjects.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            {t('loadingSubjects')}
          </p>
        )}
        {subjects.isError && (
          <p role="alert" className="text-sm text-destructive">
            {subjects.error.message}
          </p>
        )}

        {subjects.data?.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="size-4" aria-hidden />
                {t('empty.title')}
              </CardTitle>
              <CardDescription>{t('empty.description')}</CardDescription>
            </CardHeader>
            {isDemo && (
              <CardContent className="grid gap-2">
                <Button variant="outline" disabled={samples.isPending} onClick={() => samples.mutate()}>
                  {samples.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <FlaskConical aria-hidden />}
                  {t('empty.addSample')}
                </Button>
                {samples.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {samples.error.message}
                  </p>
                )}
              </CardContent>
            )}
          </Card>
        )}

        {subjects.data?.map((subject) => {
          const topics = topicsOf(subject.id)
          const labels = priorityLabels(topics.filter((topic) => topic.track === 'exam'))
          const high = [...labels.values()].filter((label) => label === 'High').length
          const readiness = subject.kind === 'course' ? examReadiness(topics, mocks.data?.get(subject.id)?.score ?? null) : null
          return (
            <Link key={subject.id} to={`/academics/subjects/${subject.id}`} className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              <Card className="transition-colors hover:bg-muted/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                    {subject.code && <Badge variant="outline">{subject.code}</Badge>}
                    {subject.kind === 'skill_course' && <Badge variant="secondary">{t('skillCourseBadge')}</Badge>}
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </CardTitle>
                  <CardDescription>
                    {subject.kind === 'skill_course'
                      ? t('weeklyLimit', { time: minutesLabel(subject.weekly_minutes_limit ?? DEFAULT_SKILL_WEEKLY_MINUTES) })
                      : examLabel(subject.exam_date, today)}{' '}
                    · {topics.length === 0 ? t('noRoadmapYet') : `${countLabel(topics.length, 'topic')}${high > 0 ? `, ${t('highPriorityCount', { count: high })}` : ''}`}
                  </CardDescription>
                  {readiness && (
                    <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                      <span className="shrink-0">{t('examReadiness', { percent: percentText(readiness.score) })}</span>
                      <ShareBar share={readiness.score} className="flex-1" />
                    </div>
                  )}
                </CardHeader>
              </Card>
            </Link>
          )
        })}
        {subjects.data && subjects.data.length > 0 && (
          <p className="text-xs text-muted-foreground">{t('openSubjectHint')}</p>
        )}
      </div>

      <SubjectDialog open={adding} onOpenChange={setAdding} onSaved={(subject) => navigate(`/academics/subjects/${subject.id}`)} />
    </>
  )
}
