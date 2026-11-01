import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { LoaderCircle, Minus, Plus, Trash2 } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import { useClients, type Client } from './clients'
import { useHustleMutation, type Hustle } from './hustles'
import { clientWord, formatMoney } from './labels'
import { deleteTransaction, inMonth, monthKey, saveTransaction, totals, useTransactions, type MoneyKind, type Transaction } from './money'

const NO_CLIENT = 'none'

interface Editing {
  /** null = new money. */
  transaction: Transaction | null
  kind: MoneyKind
}

/** A hustle's money: this month's net profit, all of it, and the list of income and expenses. */
export function MoneyTab({ hustle }: { hustle: Hustle }) {
  const now = useNow(60_000)
  const money = useTransactions(hustle.id)
  const clients = useClients(hustle.id)
  const [editing, setEditing] = useState<Editing | null>(null)
  const all = money.data ?? []
  const month = totals(inMonth(all, monthKey(now)))
  const overall = totals(all)
  const clientName = new Map((clients.data ?? []).map((client) => [client.id, client.name]))
  const show = (amount: number) => formatMoney(amount, hustle.currency)

  return (
    <div className="grid gap-4">
      <Card size="sm">
        <CardHeader>
          <CardDescription>Net profit in {format(now, 'MMMM')}</CardDescription>
          <CardTitle className={cn('text-2xl', month.net < 0 && 'text-destructive')}>{show(month.net)}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm text-muted-foreground">
          <p>
            Income {show(month.income)} · Expenses {show(month.expense)}
          </p>
          <p>
            All time: {show(overall.net)} net profit ({show(overall.income)} in, {show(overall.expense)} out)
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={() => setEditing({ transaction: null, kind: 'income' })}>
          <Plus aria-hidden />
          Income
        </Button>
        <Button variant="outline" onClick={() => setEditing({ transaction: null, kind: 'expense' })}>
          <Minus aria-hidden />
          Expense
        </Button>
      </div>

      {money.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Loading…
        </p>
      ) : all.length === 0 ? (
        <p className="text-sm text-muted-foreground">No money yet. Log your first payment or expense, even a small one.</p>
      ) : (
        <ul className="grid gap-1">
          {all.map((transaction) => (
            <li key={transaction.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/40"
                onClick={() => setEditing({ transaction, kind: transaction.kind === 'expense' ? 'expense' : 'income' })}
              >
                <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{format(parseISO(transaction.occurred_on), 'd MMM')}</span>
                <span className="min-w-0 flex-1 truncate">
                  {transaction.category ?? transaction.note ?? (transaction.kind === 'income' ? 'Income' : 'Expense')}
                  {transaction.client_id && clientName.has(transaction.client_id) && <span className="text-muted-foreground"> · {clientName.get(transaction.client_id)}</span>}
                </span>
                <span className={cn('shrink-0 font-medium tabular-nums', transaction.kind === 'income' ? 'text-emerald-600' : 'text-destructive')}>
                  {transaction.kind === 'income' ? '+' : '−'}
                  {show(Number(transaction.amount))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {money.error && (
        <p role="alert" className="text-sm text-destructive">
          {money.error.message}
        </p>
      )}
      <TransactionDialog hustle={hustle} clients={clients.data ?? []} editing={editing} today={format(now, 'yyyy-MM-dd')} onClose={() => setEditing(null)} />
    </div>
  )
}

interface TransactionDialogProps {
  hustle: Hustle
  clients: Client[]
  editing: Editing | null
  /** 'YYYY-MM-DD': new money is dated today. */
  today: string
  onClose: () => void
}

export function TransactionDialog({ hustle, clients, editing, today, onClose }: TransactionDialogProps) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {editing && <TransactionForm hustle={hustle} clients={clients} editing={editing} today={today} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

interface TransactionFormProps {
  hustle: Hustle
  clients: Client[]
  editing: Editing
  today: string
  onDone: () => void
}

function TransactionForm({ hustle, clients, editing, today, onDone }: TransactionFormProps) {
  const { transaction } = editing
  const save = useHustleMutation(saveTransaction)
  const remove = useHustleMutation(deleteTransaction)
  const [kind, setKind] = useState<MoneyKind>(editing.kind)
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '')
  const [date, setDate] = useState(transaction?.occurred_on ?? today)
  const [clientId, setClientId] = useState(transaction?.client_id ?? NO_CLIENT)
  const [category, setCategory] = useState(transaction?.category ?? '')
  const [note, setNote] = useState(transaction?.note ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const words = clientWord(hustle.type)

  function submit() {
    const value = Number(amount)
    if (!(value > 0 && value < 10_000_000_000)) return setProblem('Enter an amount above 0.')
    if (!date) return setProblem('Pick the date.')
    setProblem(null)
    save.mutate(
      {
        hustleId: hustle.id,
        currency: hustle.currency,
        id: transaction?.id ?? null,
        fields: {
          kind,
          amount: Math.round(value * 100) / 100,
          occurredOn: date,
          clientId: clientId === NO_CLIENT ? null : clientId,
          itemId: transaction?.hustle_item_id ?? null,
          category,
          note,
        },
      },
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
        <DialogTitle>{transaction ? 'Edit' : kind === 'income' ? 'Log income' : 'Log an expense'}</DialogTitle>
      </DialogHeader>
      <div className="flex gap-2" role="group" aria-label="Income or expense">
        {(['income', 'expense'] as const).map((option) => (
          <Button key={option} type="button" size="sm" variant={kind === option ? 'default' : 'outline'} aria-pressed={kind === option} onClick={() => setKind(option)}>
            {option === 'income' ? 'Income' : 'Expense'}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="money-amount">Amount (₹)</Label>
          <Input id="money-amount" type="number" inputMode="decimal" min={0} step="any" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="money-date">Date</Label>
          <Input id="money-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
      </div>
      {clients.length > 0 && (
        <div className="grid gap-1.5">
          <Label htmlFor="money-client">{words.title}</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger id="money-client" className="w-56">
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
        <Label htmlFor="money-category">What for (optional)</Label>
        <Input
          id="money-category"
          maxLength={80}
          placeholder={kind === 'income' ? 'e.g. Café logo' : 'e.g. Canva Pro, ads, materials'}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="money-note">Note (optional)</Label>
        <Input id="money-note" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      {(problem ?? save.error ?? remove.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? save.error?.message ?? remove.error?.message}
        </p>
      )}
      <DialogFooter>
        {transaction && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" className="text-destructive sm:mr-auto" disabled={remove.isPending}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this {transaction.kind === 'income' ? 'income' : 'expense'}?</AlertDialogTitle>
                <AlertDialogDescription>
                  {formatMoney(Number(transaction.amount), hustle.currency)} on {format(parseISO(transaction.occurred_on), 'd MMM yyyy')} is removed from your totals.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => remove.mutate(transaction.id, { onSuccess: onDone })}>
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
