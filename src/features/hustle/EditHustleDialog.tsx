import { useState } from 'react'
import { LoaderCircle, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { deleteHustle, updateHustle, useHustleMutation, type Hustle } from './hustles'
import { HUSTLE_STATUS_LABEL } from './labels'

/** Edit a hustle's name, goal and status, or delete it. */
export function EditHustleDialog({ hustle }: { hustle: Hustle }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil aria-hidden />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">{open && <EditForm hustle={hustle} onDone={() => setOpen(false)} />}</DialogContent>
    </Dialog>
  )
}

function EditForm({ hustle, onDone }: { hustle: Hustle; onDone: () => void }) {
  const navigate = useNavigate()
  const save = useHustleMutation(updateHustle)
  const remove = useHustleMutation(deleteHustle)
  const [name, setName] = useState(hustle.name)
  const [goal, setGoal] = useState(hustle.goal ?? '')
  const [amount, setAmount] = useState(hustle.goal_amount === null ? '' : String(hustle.goal_amount))
  const [date, setDate] = useState(hustle.goal_date ?? '')
  const [status, setStatus] = useState(hustle.status)
  const [problem, setProblem] = useState<string | null>(null)

  function submit() {
    const goalAmount = amount.trim() === '' ? null : Number(amount)
    if (!name.trim()) return setProblem('Give your hustle a name.')
    if (goalAmount !== null && !(goalAmount >= 0 && goalAmount < 10_000_000_000)) return setProblem('The goal amount must be a number of 0 or more.')
    setProblem(null)
    save.mutate(
      { id: hustle.id, patch: { name: name.trim(), goal: goal.trim() || null, goal_amount: goalAmount, goal_date: date || null, status } },
      { onSuccess: onDone },
    )
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>Edit hustle</DialogTitle>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-hustle-name">Name</Label>
        <Input id="edit-hustle-name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-hustle-goal">Goal</Label>
        <Input id="edit-hustle-goal" maxLength={160} value={goal} onChange={(event) => setGoal(event.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="edit-hustle-amount">Money goal</Label>
          <Input id="edit-hustle-amount" type="number" inputMode="numeric" min={0} step={100} value={amount} onChange={(event) => setAmount(event.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edit-hustle-date">By</Label>
          <Input id="edit-hustle-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-hustle-status">Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger id="edit-hustle-status" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['active', 'paused', 'archived'].map((value) => (
              <SelectItem key={value} value={value}>
                {HUSTLE_STATUS_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {(problem ?? save.error ?? remove.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? save.error?.message ?? remove.error?.message}
        </p>
      )}
      <DialogFooter>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="ghost" className="text-destructive sm:mr-auto">
              <Trash2 aria-hidden />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{hustle.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                Its phases, board, clients' links, money and time records are deleted. To keep them, set the status to Archived instead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => remove.mutate(hustle.id, { onSuccess: () => void navigate('/hustle') })}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}
