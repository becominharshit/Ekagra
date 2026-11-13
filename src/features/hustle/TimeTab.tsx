import { useState } from 'react'
import { LoaderCircle, Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { minutesLabel } from '@/features/academics/labels'
import { useNow, useTimezone } from '@/hooks/useNow'
import { dateKeyInTimezone, formatShortDateInTimezone } from '@/lib/timezone'
import { useClients, type Client } from './clients'
import { clientEarnings, earnings, monthEarnings, perHourLabel } from './earnings'
import { useHustleMutation, type Hustle } from './hustles'
import { clientWord } from './labels'
import { useTransactions } from './money'
import { addManualTime, deleteTimeEntry, useTimeEntries } from './time'

const NO_CLIENT = 'none'

/** Hours spent on a hustle and what they earned: earnings per hour for the hustle and each client. */
export function TimeTab({ hustle }: { hustle: Hustle }) {
  const now = useNow(60_000)
  const timeZone = useTimezone()
  const entries = useTimeEntries(hustle.id)
  const money = useTransactions(hustle.id)
  const clients = useClients(hustle.id)
  const remove = useHustleMutation(deleteTimeEntry)
  const [adding, setAdding] = useState(false)
  const rows = entries.data ?? []
  const all = earnings(money.data ?? [], rows)
  const month = monthEarnings(money.data ?? [], rows, now, timeZone)
  const perClient = clientEarnings(money.data ?? [], rows)
  const clientName = new Map((clients.data ?? []).map((client) => [client.id, client.name]))
  const words = clientWord(hustle.type)
  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long', timeZone }).format(now)

  return (
    <div className="grid gap-4">
      <Card size="sm">
        <CardHeader>
          <CardDescription>Earnings per hour (net profit ÷ hours)</CardDescription>
          <CardTitle className="text-lg">{perHourLabel(all, hustle.currency)}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm text-muted-foreground">
          <p>
            In {monthLabel}: {perHourLabel(month, hustle.currency)}
          </p>
          <p>Focus sessions on this hustle's blocks are added here by themselves. Add other time by hand.</p>
        </CardContent>
      </Card>

      {perClient.size > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Per {words.one}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {[...perClient].map(([id, value]) => (
                <li key={id} className="flex justify-between gap-3">
                  <span className="truncate">{clientName.get(id) ?? `A deleted ${words.one}`}</span>
                  <span className="shrink-0 text-muted-foreground">{perHourLabel(value, hustle.currency)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Button className="justify-self-start" onClick={() => setAdding(true)}>
        <Plus aria-hidden />
        Add time
      </Button>

      {entries.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No time yet. Start focus on a hustle block on Today, or add time by hand.</p>
      ) : (
        <ul className="grid gap-1">
          {rows.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm">
              <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{formatShortDateInTimezone(entry.started_at, timeZone)}</span>
              <span className="min-w-0 flex-1 truncate">
                {minutesLabel(entry.minutes)}
                {entry.client_id && clientName.has(entry.client_id) && <span className="text-muted-foreground"> · {clientName.get(entry.client_id)}</span>}
                {entry.note && <span className="text-muted-foreground"> · {entry.note}</span>}
              </span>
              <Badge variant="outline">{entry.source === 'focus' ? 'Focus' : 'Manual'}</Badge>
              <Button variant="ghost" size="icon-xs" aria-label={`Delete ${minutesLabel(entry.minutes)} on ${formatShortDateInTimezone(entry.started_at, timeZone)}`} disabled={remove.isPending} onClick={() => remove.mutate(entry.id)}>
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {(entries.error ?? remove.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(entries.error ?? remove.error)?.message}
        </p>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>{adding && <AddTimeForm hustle={hustle} clients={clients.data ?? []} today={dateKeyInTimezone(now, timeZone)} onDone={() => setAdding(false)} />}</DialogContent>
      </Dialog>
    </div>
  )
}

function AddTimeForm({ hustle, clients, today, onDone }: { hustle: Hustle; clients: Client[]; today: string; onDone: () => void }) {
  const timeZone = useTimezone()
  const add = useHustleMutation(addManualTime)
  const words = clientWord(hustle.type)
  const [date, setDate] = useState(today)
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [clientId, setClientId] = useState(NO_CLIENT)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const total = Number(hours || 0) * 60 + Number(minutes || 0)
        if (!(total >= 1 && total <= 24 * 60)) return setProblem('Enter between 1 minute and 24 hours.')
        if (!date) return setProblem('Pick the date.')
        setProblem(null)
        add.mutate({ hustleId: hustle.id, fields: { date, minutes: total, clientId: clientId === NO_CLIENT ? null : clientId, note }, timeZone }, { onSuccess: onDone })
      }}
    >
      <DialogHeader>
        <DialogTitle>Add time</DialogTitle>
        <DialogDescription>Time you spent on {hustle.name} outside a focus session.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3 grid gap-1.5 sm:col-span-1">
          <Label htmlFor="time-date">Date</Label>
          <Input id="time-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="time-hours">Hours</Label>
          <Input id="time-hours" type="number" inputMode="numeric" min={0} max={24} value={hours} onChange={(event) => setHours(event.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="time-minutes">Minutes</Label>
          <Input id="time-minutes" type="number" inputMode="numeric" min={0} max={59} step={5} value={minutes} onChange={(event) => setMinutes(event.target.value)} />
        </div>
      </div>
      {clients.length > 0 && (
        <div className="grid gap-1.5">
          <Label htmlFor="time-client">{words.title}</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger id="time-client" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CLIENT}>No {words.one}</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="time-note">What you did (optional)</Label>
        <Input id="time-note" maxLength={200} placeholder="e.g. Client call, sketches" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      {(problem ?? add.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? add.error?.message}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={add.isPending}>
          {add.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          Add
        </Button>
      </DialogFooter>
    </form>
  )
}
