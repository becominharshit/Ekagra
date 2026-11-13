import { useState } from 'react'
import { format } from 'date-fns'
import { LoaderCircle, Trash2 } from 'lucide-react'
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { localToIso } from '@/features/planner/schedule'
import { currencySymbol } from '@/lib/currency'
import { useClients } from './clients'
import type { Hustle } from './hustles'
import { useHustleMutation } from './hustles'
import { addItem, deleteItem, itemNotes, moveItems, updateItem, type HustleItem } from './items'
import { CARD_WORDS, clientWord } from './labels'
import { moveToColumn } from './ordering'
import { TEMPLATES, toHustleType } from './templates'

const NO_CLIENT = 'none'

export interface EditingItem {
  /** null = a new card. */
  item: HustleItem | null
  stage: string
}

interface ItemDialogProps {
  hustle: Hustle
  editing: EditingItem | null
  columns: Map<string, HustleItem[]>
  onClose: () => void
  /** Called after a card was moved to another column (e.g. to offer logging the payment). */
  onMoved?: (card: HustleItem, stage: string) => void
}

/** Add or edit a card on the pipeline board. */
export function ItemDialog({ hustle, editing, columns, onClose, onMoved }: ItemDialogProps) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {editing && (
          <ItemForm key={editing.item?.id ?? `new-${editing.stage}`} hustle={hustle} editing={editing} columns={columns} onDone={onClose} onMoved={onMoved} />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface ItemFormProps {
  hustle: Hustle
  editing: EditingItem
  columns: Map<string, HustleItem[]>
  onDone: () => void
  onMoved?: (card: HustleItem, stage: string) => void
}

function ItemForm({ hustle, editing, columns, onDone, onMoved }: ItemFormProps) {
  const words = CARD_WORDS[TEMPLATES[toHustleType(hustle.type)].itemKind]
  const { item } = editing
  const add = useHustleMutation(addItem)
  const save = useHustleMutation(updateItem)
  const move = useHustleMutation(moveItems)
  const remove = useHustleMutation(deleteItem)
  const [title, setTitle] = useState(item?.title ?? '')
  const [amount, setAmount] = useState(item?.amount === null || item?.amount === undefined ? '' : String(item.amount))
  const [date, setDate] = useState(item?.due_at ? format(new Date(item.due_at), 'yyyy-MM-dd') : '')
  const [url, setUrl] = useState(item?.url ?? '')
  const [notes, setNotes] = useState(item ? itemNotes(item) : '')
  const [clientId, setClientId] = useState(item?.client_id ?? NO_CLIENT)
  const clients = useClients(hustle.id)
  const who = clientWord(hustle.type)
  const [stage, setStage] = useState(editing.stage)
  const [problem, setProblem] = useState<string | null>(null)
  const busy = add.isPending || save.isPending || move.isPending || remove.isPending
  const error = problem ?? add.error?.message ?? save.error?.message ?? move.error?.message ?? remove.error?.message

  async function submit() {
    const value = amount.trim() === '' ? null : Number(amount)
    if (!title.trim()) return setProblem(`Give the ${words.card} a title.`)
    if (value !== null && !(value >= 0 && value < 10_000_000_000)) return setProblem(`${words.amount} must be a number of 0 or more.`)
    setProblem(null)
    // A date without a time means the end of that day, like a task's due date.
    const fields = { title, amount: value, dueAt: date ? localToIso(date, 23 * 60 + 59) : null, url: url.trim() || null, notes, clientId: clientId === NO_CLIENT ? null : clientId }
    try {
      if (!item) {
        const column = columns.get(stage) ?? []
        await add.mutateAsync({ hustle, stage, fields, after: column.at(-1)?.order_index ?? null })
      } else {
        await save.mutateAsync({ item, fields })
        if (stage !== editing.stage) {
          await move.mutateAsync(moveToColumn(columns.get(stage) ?? [], item, stage))
          onDone()
          onMoved?.({ ...item, title: fields.title.trim(), amount: fields.amount, client_id: fields.clientId, stage }, stage)
          return
        }
      }
      onDone()
    } catch {
      // The mutation's error is shown below.
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>{item ? `Edit ${words.card}` : `New ${words.card} in ${stage}`}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="item-title">Title</Label>
        <Input id="item-title" placeholder={words.example} maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="item-amount">
            {words.amount} ({currencySymbol(hustle.currency)})
          </Label>
          <Input id="item-amount" type="number" inputMode="numeric" min={0} step={50} value={amount} onChange={(event) => setAmount(event.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="item-date">{words.date}</Label>
          <Input id="item-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
      </div>
      {(clients.data?.length ?? 0) > 0 && (
        <div className="grid gap-1.5">
          <Label htmlFor="item-client">{who.title}</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger id="item-client" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CLIENT}>No {who.one}</SelectItem>
              {(clients.data ?? []).map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="item-url">Link (optional)</Label>
        <Input id="item-url" type="url" inputMode="url" placeholder="https://" maxLength={500} value={url} onChange={(event) => setUrl(event.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="item-notes">Notes (optional)</Label>
        <Textarea id="item-notes" rows={2} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
      {item && (
        <div className="grid gap-1.5">
          <Label htmlFor="item-stage">Column</Label>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger id="item-stage" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hustle.pipeline_stages.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        {item && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" className="text-destructive sm:mr-auto" disabled={busy}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{item.title}”?</AlertDialogTitle>
                <AlertDialogDescription>The card is removed from the board. Money you logged for it stays.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => remove.mutate(item.id, { onSuccess: onDone })}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <Button type="submit" disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" aria-hidden />}
          {item ? 'Save' : `Add ${words.card}`}
        </Button>
      </DialogFooter>
    </form>
  )
}
