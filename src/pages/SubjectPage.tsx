import { useState } from 'react'
import { format } from 'date-fns'
import { ArrowLeft, FileUp, LoaderCircle, Pencil, ScrollText, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DIFFICULTY_LABEL, examLabel, minutesLabel } from '@/features/academics/labels'
import { usePapers } from '@/features/academics/papers'
import { useRoadmap } from '@/features/academics/roadmap'
import { SubjectDialog } from '@/features/academics/SubjectDialog'
import { deleteSubject, useAcademicsMutation, useSubject } from '@/features/academics/subjects'
import { prerequisiteTitles, priorityLabels, roadmapSections, type PriorityLabel, type Topic } from '@/features/academics/topicTree'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'

const PRIORITY_TONE = {
  High: 'bg-destructive/10 text-destructive',
  Medium: 'bg-mode-hustle/15 text-mode-hustle',
  Low: 'bg-muted text-muted-foreground',
}

/** One subject: its roadmap on the exam and skill tracks, and links to import, edit and past papers. */
export function SubjectPage() {
  const { subjectId } = useParams()
  const navigate = useNavigate()
  const subject = useSubject(subjectId)
  const roadmap = useRoadmap(subjectId)
  const papers = usePapers(subjectId)
  const [track, setTrack] = useState<'exam' | 'skill'>('exam')
  const [order, setOrder] = useState<'syllabus' | 'priority'>('syllabus')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const remove = useAcademicsMutation(deleteSubject)
  const today = format(useNow(60_000), 'yyyy-MM-dd')

  if (subject.isPending || roadmap.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  if (!subject.data || !roadmap.data) {
    return (
      <div className="grid gap-3">
        <p role="alert" className="text-sm text-destructive">
          {subject.error?.message ?? roadmap.error?.message ?? 'This subject was not found.'}
        </p>
        <BackLink />
      </div>
    )
  }

  const current = subject.data
  const leaves = roadmap.data.topics.filter((topic) => topic.parent_id !== null)
  const count = (which: 'exam' | 'skill') => leaves.filter((topic) => topic.track === which).length
  const sections = roadmapSections(roadmap.data, track, order)
  const needs = prerequisiteTitles(roadmap.data)
  const labels = priorityLabels(leaves.filter((topic) => topic.track === 'exam'))
  const paperCount = papers.data?.papers.length ?? 0

  return (
    <>
      <BackLink />
      <PageHeader title={current.name} subtitle={[current.code, examLabel(current.exam_date, today)].filter(Boolean).join(' · ')} />

      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant={leaves.length === 0 ? 'default' : 'outline'}>
            <Link to={`/academics/subjects/${current.id}/import`}>
              <FileUp aria-hidden />
              {leaves.length === 0 ? 'Import syllabus' : 'Import again'}
            </Link>
          </Button>
          {leaves.length > 0 && (
            <Button asChild variant="outline">
              <Link to={`/academics/subjects/${current.id}/edit`}>
                <Pencil aria-hidden />
                Edit roadmap
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to={`/academics/subjects/${current.id}/papers`}>
              <ScrollText aria-hidden />
              Past papers{paperCount > 0 ? ` (${paperCount})` : ''}
            </Link>
          </Button>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit subject
          </Button>
          <Button variant="ghost" className="text-destructive" onClick={() => setDeleting(true)}>
            <Trash2 aria-hidden />
            Delete
          </Button>
        </div>

        {leaves.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No roadmap yet</CardTitle>
              <CardDescription>
                Import the syllabus (text, PDF or photo). You get units and topics with time estimates, on an exam track and
                a skill track. Then add past papers to see which topics matter most.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Tabs value={track} onValueChange={(next) => setTrack(next === 'skill' ? 'skill' : 'exam')}>
                <TabsList>
                  <TabsTrigger value="exam">Exam track ({count('exam')})</TabsTrigger>
                  <TabsTrigger value="skill">Skill track ({count('skill')})</TabsTrigger>
                </TabsList>
              </Tabs>
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={order}
                onValueChange={(next) => next && setOrder(next === 'priority' ? 'priority' : 'syllabus')}
                aria-label="Order"
              >
                <ToggleGroupItem value="syllabus">Syllabus order</ToggleGroupItem>
                <ToggleGroupItem value="priority">By priority</ToggleGroupItem>
              </ToggleGroup>
            </div>

            {sections.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {track === 'skill' ? 'No skill-track topics yet. Add some with Edit roadmap.' : 'No exam-track topics yet.'}
              </p>
            )}
            {sections.map((section) => (
              <Card key={section.title}>
                <CardHeader>
                  <CardTitle>{section.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-3">
                    {section.topics.map((topic) => (
                      <TopicItem key={topic.id} topic={topic} needs={needs.get(topic.id) ?? []} priority={labels.get(topic.id) ?? null} />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
            {paperCount === 0 && track === 'exam' && (
              <p className="text-sm text-muted-foreground">
                Priorities so far come from the syllabus. Add past papers to see which topics are asked most.
              </p>
            )}
          </>
        )}
      </div>

      <SubjectDialog open={editing} onOpenChange={setEditing} subject={current} />
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {current.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the subject with its roadmap and past papers. It can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.error && (
            <p role="alert" className="text-sm text-destructive">
              {remove.error.message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault()
                remove.mutate(current.id, { onSuccess: () => navigate('/academics', { replace: true }) })
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
      <Link to="/academics">
        <ArrowLeft aria-hidden />
        Academics
      </Link>
    </Button>
  )
}

/** One topic; `priority` is only given on the exam track. */
function TopicItem({ topic, needs, priority }: { topic: Topic; needs: string[]; priority: PriorityLabel | null }) {
  const details = [
    topic.est_minutes !== null ? minutesLabel(topic.est_minutes) : null,
    topic.difficulty !== null ? DIFFICULTY_LABEL[topic.difficulty] : null,
    topic.pyq_count > 0
      ? `asked ${topic.pyq_count}× (${Math.round(Number(topic.pyq_marks_share) * 100)}% of marks)${topic.last_asked_year ? `, last ${topic.last_asked_year}` : ''}`
      : null,
  ].filter(Boolean)
  return (
    <li className="grid gap-0.5">
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium">{topic.title}</span>
        {priority && (
          <Badge variant="secondary" className={cn('shrink-0', PRIORITY_TONE[priority])}>
            {priority}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{details.join(' · ')}</p>
      {needs.length > 0 && <p className="text-xs text-muted-foreground">After: {needs.join(', ')}</p>}
    </li>
  )
}
