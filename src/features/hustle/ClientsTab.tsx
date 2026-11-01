import { useState } from 'react'
import { LoaderCircle, Plus, Trash2 } from 'lucide-react'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { countLabel } from '@/features/academics/labels'
import { deleteClient, saveClient, useClients, type Client } from './clients'
import { useHustleMutation, type Hustle } from './hustles'
import { useHustleItems } from './items'
import { CARD_WORDS, clientWord, formatMoney } from './labels'
import { clientTotals, useTransactions } from './money'
import { TEMPLATES, toHustleType } from './templates'

/** A hustle's clients (students, for tutoring) with what each one brought in. */
export function ClientsTab({ hustle }: { hustle: Hustle }) {
  const clients = useClients(hustle.id)
  const money = useTransactions(hustle.id)
  const items = useHustleItems(hustle.id)
  const [editing, setEditing] = useState<Client | 'new' | null>(null)
  const words = clientWord(hustle.type)
  const cardWord = CARD_WORDS[TEMPLATES[toHustleType(hustle.type)].itemKind].card
  const earned = clientTotals(money.data ?? [])

  return (
    <div className="grid gap-3">
      <Button className="justify-self-start" onClick={() => setEditing('new')}>
        <Plus aria-hidden />
        Add a {words.one}
      </Button>
      {clients.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Loading…
        </p>
      )}
      {clients.data?.length === 0 && <p className="text-sm text-muted-foreground">No {words.many.toLowerCase()} yet.</p>}
      {(clients.data ?? []).map((client) => {
        const cards = (items.data ?? []).filter((item) => item.client_id === client.id).length
        const total = earned.get(client.id)
        return (
          <button key={client.id} type="button" className="text-left" onClick={() => setEditing(client)}>
            <Card size="sm" className="transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle>{client.name}</CardTitle>
                <CardDescription>{[client.platform, client.contact].filter(Boolean).join(' · ') || `No contact details`}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm">
                Earned {formatMoney(total?.net ?? 0, hustle.currency)}
                {cards > 0 && <span className="text-muted-foreground"> · {countLabel(cards, cardWord)}</span>}
              </CardContent>
            </Card>
          </button>
        )
      })}
      {clients.error && (
        <p role="alert" className="text-sm text-destructive">
          {clients.error.message}
        </p>
      )}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>{editing && <ClientForm hustle={hustle} client={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}</DialogContent>
      </Dialog>
    </div>
  )
}

function ClientForm({ hustle, client, onDone }: { hustle: Hustle; client: Client | null; onDone: () => void }) {
  const words = clientWord(hustle.type)
  const save = useHustleMutation(saveClient)
  const remove = useHustleMutation(deleteClient)
  const [name, setName] = useState(client?.name ?? '')
  const [platform, setPlatform] = useState(client?.platform ?? '')
  const [contact, setContact] = useState(client?.contact ?? '')
  const [notes, setNotes] = useState(client?.notes ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name.trim()) return setProblem('Enter a name.')
        setProblem(null)
        save.mutate({ hustleId: hustle.id, id: client?.id ?? null, fields: { name, platform, contact, notes } }, { onSuccess: onDone })
      }}
    >
      <DialogHeader>
        <DialogTitle>{client ? `Edit ${words.one}` : `New ${words.one}`}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="client-name">Name</Label>
        <Input id="client-name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="client-platform">Where from</Label>
          <Input id="client-platform" maxLength={60} placeholder={hustle.type === 'parttime' ? 'e.g. Referral' : 'e.g. Fiverr'} value={platform} onChange={(event) => setPlatform(event.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="client-contact">Contact</Label>
          <Input id="client-contact" maxLength={120} placeholder="Phone, email or @handle" value={contact} onChange={(event) => setContact(event.target.value)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="client-notes">Notes</Label>
        <Textarea id="client-notes" rows={2} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
      {(problem ?? save.error ?? remove.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? save.error?.message ?? remove.error?.message}
        </p>
      )}
      <DialogFooter>
        {client && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" className="text-destructive sm:mr-auto">
                <Trash2 aria-hidden />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{client.name}”?</AlertDialogTitle>
                <AlertDialogDescription>Their cards, money and time stay, just without the name.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => remove.mutate(client.id, { onSuccess: onDone })}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}
