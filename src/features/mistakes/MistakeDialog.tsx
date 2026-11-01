import { useState, type FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useTopicChoices } from '@/features/academics/roadmap'
import { useAcademicsMutation } from '@/features/academics/subjects'
import type { Mistake } from './ladder'
import { addMistake, updateMistake } from './mistakes'

const NO_TOPIC = 'none'

interface MistakeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The mistake to edit. Without it, a new one is added. */
  mistake?: Mistake | null
}

/** Write down a mistake (or improve one): the concept, why it went wrong and the correct approach. */
export function MistakeDialog({ open, onOpenChange, mistake }: MistakeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* The form only exists while the dialog is open, so it starts fresh every time. */}
        <MistakeForm mistake={mistake ?? null} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function MistakeForm({ mistake, onDone }: { mistake: Mistake | null; onDone: () => void }) {
  const topics = useTopicChoices()
  const [concept, setConcept] = useState(mistake?.concept ?? '')
  const [whyWrong, setWhyWrong] = useState(mistake?.why_wrong ?? '')
  const [approach, setApproach] = useState(mistake?.correct_approach ?? '')
  const [topicId, setTopicId] = useState(mistake?.topic_id ?? NO_TOPIC)
  const [problem, setProblem] = useState<string | null>(null)
  const save = useAcademicsMutation<void, void>(async (source) => {
    const values = {
      concept: concept.trim(),
      why_wrong: whyWrong.trim() || null,
      correct_approach: approach.trim() || null,
      topic_id: topicId === NO_TOPIC ? null : topicId,
    }
    if (mistake) await updateMistake(source, { id: mistake.id, patch: values })
    else await addMistake(source, values)
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!concept.trim()) {
      setProblem('Write what the mistake was about.')
      return
    }
    setProblem(null)
    save.mutate(undefined, { onSuccess: onDone })
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{mistake ? 'Edit mistake' : 'Add a mistake'}</DialogTitle>
        <DialogDescription>Writing down why it went wrong is what makes it stick.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="mistake-concept">What was it about?</Label>
        <Textarea id="mistake-concept" rows={2} maxLength={1000} placeholder="e.g. BCNF vs 3NF" value={concept} onChange={(e) => setConcept(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="mistake-why">Why was it wrong?</Label>
        <Textarea
          id="mistake-why"
          rows={2}
          maxLength={2000}
          placeholder="e.g. I thought 3NF already needs every determinant to be a key"
          value={whyWrong}
          onChange={(e) => setWhyWrong(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="mistake-approach">The correct approach</Label>
        <Textarea
          id="mistake-approach"
          rows={3}
          maxLength={4000}
          placeholder="e.g. BCNF: every determinant is a superkey. 3NF also allows it when the right side is part of a key."
          value={approach}
          onChange={(e) => setApproach(e.target.value)}
        />
      </div>
      {topics.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="mistake-topic">Topic (optional)</Label>
          <Select value={topicId} onValueChange={setTopicId}>
            <SelectTrigger id="mistake-topic" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TOPIC}>No topic</SelectItem>
              {topics.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>
                  {topic.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {(problem || save.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? save.error?.message}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          {mistake ? 'Save' : 'Add mistake'}
        </Button>
      </DialogFooter>
    </form>
  )
}
