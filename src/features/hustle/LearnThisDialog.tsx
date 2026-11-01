import { useState } from 'react'
import { GraduationCap, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { minutesLabel } from '@/features/academics/labels'
import { useStudy } from '@/features/academics/roadmap'
import { DEFAULT_SKILL_WEEKLY_MINUTES } from '@/features/planner/studyData'
import type { HustleStep } from './hustles'
import { findSkillCourse, useLearnSkill } from './skillBridge'

const NEW_COURSE = 'new'
const WEEKLY_CHOICES = [60, 120, 180, 300]

/** "Learn this" on a hustle step: a skill course in Academics (or an existing skill topic) that the planner makes time for. */
export function LearnThisDialog({ step, onClose }: { step: HustleStep | null; onClose: () => void }) {
  return (
    <Dialog open={step !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">{step && <LearnThisForm step={step} onDone={onClose} />}</DialogContent>
    </Dialog>
  )
}

function LearnThisForm({ step, onDone }: { step: HustleStep; onDone: () => void }) {
  const study = useStudy()
  const learn = useLearnSkill()
  const [name, setName] = useState(step.skill_name ?? '')
  const [target, setTarget] = useState(NEW_COURSE)
  const [weekly, setWeekly] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const subjects = study.data?.subjects ?? []
  const course = findSkillCourse(subjects, name)
  const minutes = weekly ?? course?.weekly_minutes_limit ?? DEFAULT_SKILL_WEEKLY_MINUTES
  // Skill-track topics not learned yet, from any subject (e.g. a syllabus's skill track).
  const skillTopics = (study.data?.topics ?? [])
    .filter((topic) => topic.parent_id !== null && topic.track === 'skill' && topic.status !== 'review' && topic.status !== 'mastered')
    .map((topic) => ({ id: topic.id, label: `${subjects.find((subject) => subject.id === topic.subject_id)?.name ?? 'Subject'}: ${topic.title}` }))
  const choices = WEEKLY_CHOICES.includes(minutes) ? WEEKLY_CHOICES : [...WEEKLY_CHOICES, minutes].sort((a, b) => a - b)

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (target === NEW_COURSE && !name.trim()) return setProblem('Name the skill, e.g. "Video editing".')
        setProblem(null)
        learn.mutate({ step, skillName: name, weeklyMinutes: minutes, topicId: target === NEW_COURSE ? null : target }, { onSuccess: onDone })
      }}
    >
      <DialogHeader>
        <DialogTitle>Learn this</DialogTitle>
        <DialogDescription>For “{step.title}”. The skill becomes study time in your plan.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="learn-skill">Skill</Label>
        <Input id="learn-skill" maxLength={60} placeholder="e.g. Video editing" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      {skillTopics.length > 0 && (
        <div className="grid gap-1.5">
          <Label htmlFor="learn-target">Learn it with</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="learn-target" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NEW_COURSE}>{course ? `My skill course “${course.name}”` : 'A new skill course'}</SelectItem>
              {skillTopics.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>
                  {topic.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {target === NEW_COURSE && (
        <div className="grid gap-1.5">
          <Label htmlFor="learn-weekly">Time for it each week</Label>
          <Select value={String(minutes)} onValueChange={(value) => setWeekly(Number(value))}>
            <SelectTrigger id="learn-weekly" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {choices.map((choice) => (
                <SelectItem key={choice} value={String(choice)}>
                  {minutesLabel(choice)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {target === NEW_COURSE
          ? `${course ? `Your skill course “${course.name}” gets` : `A skill course “${name.trim() || 'your skill'}” with a first topic gets`} up to ${minutesLabel(minutes)} a week in your plan, after your exam subjects' pace. It pauses in exam season. Add topics or import an outline in Academics.`
          : 'The step links to that topic; it gets time in your plan with its subject.'}
      </p>
      {(problem ?? learn.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? learn.error?.message}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={learn.isPending || study.isPending}>
          {learn.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <GraduationCap aria-hidden />}
          Learn it
        </Button>
      </DialogFooter>
    </form>
  )
}
