import { useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ExternalLink, LoaderCircle, Plus } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { useTimezone } from '@/hooks/useNow'
import { dateKeyInTimezone, formatShortDateInTimezone } from '@/lib/timezone'
import { useClients } from './clients'
import type { Hustle } from './hustles'
import { useHustleMutation } from './hustles'
import { ItemDialog, type EditingItem } from './ItemDialog'
import { applyMoves, boardColumns, moveItems, useHustleItems, type HustleItem } from './items'
import { CARD_WORDS, formatMoney, safeUrl } from './labels'
import { saveTransaction, shouldOfferPayment, useTransactions } from './money'
import { moveInColumn, moveToColumn, type PositionUpdate } from './ordering'
import { TEMPLATES, toHustleType } from './templates'

/** The hustle's pipeline board: a column per stage, cards moved with arrow buttons (they work on phones too). */
export function PipelineBoard({ hustle }: { hustle: Hustle }) {
  const timeZone = useTimezone()
  const items = useHustleItems(hustle.id)
  const money = useTransactions(hustle.id)
  const clients = useClients(hustle.id)
  const move = useHustleMutation(moveItems)
  const logPayment = useHustleMutation(saveTransaction)
  const [editing, setEditing] = useState<EditingItem | null>(null)
  const [paying, setPaying] = useState<HustleItem | null>(null)
  const offerPayment = (card: HustleItem, stage: string) => {
    if (shouldOfferPayment(card, stage, money.data ?? [])) setPaying(card)
  }
  const words = CARD_WORDS[TEMPLATES[toHustleType(hustle.type)].itemKind]
  const stages = hustle.pipeline_stages
  // A move that is still being saved already shows.
  const columns = boardColumns(stages, applyMoves(items.data ?? [], move.isPending ? move.variables : []))

  if (items.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading the board…
      </p>
    )
  }

  const save = (updates: PositionUpdate[]) => {
    if (updates.length > 0) move.mutate(updates)
  }
  const moveTo = (card: HustleItem, stage: string) =>
    move.mutate(moveToColumn(columns.get(stage) ?? [], card, stage), { onSuccess: () => offerPayment(card, stage) })
  const payingClient = paying?.client_id ? clients.data?.find((client) => client.id === paying.client_id)?.name : undefined

  return (
    <div className="grid gap-2">
      {(items.error ?? move.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(items.error ?? move.error)?.message}
        </p>
      )}
      {/* Columns scroll sideways; each one snaps into place on a phone. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 lg:-mx-8 lg:px-8">
        {stages.map((stage, stageIndex) => {
          const cards = columns.get(stage) ?? []
          const total = cards.reduce((sum, card) => sum + (card.amount === null ? 0 : Number(card.amount)), 0)
          const previous = stages[stageIndex - 1]
          const next = stages[stageIndex + 1]
          return (
            <section key={stage} aria-label={stage} className="flex w-64 shrink-0 snap-start flex-col gap-2 rounded-xl bg-muted/50 p-2">
              <header className="flex items-baseline justify-between gap-2 px-1">
                <h3 className="text-sm font-medium">{stage}</h3>
                <span className="text-xs text-muted-foreground">
                  {cards.length}
                  {total > 0 && ` · ${formatMoney(total, hustle.currency)}`}
                </span>
              </header>
              {cards.map((card, index) => (
                <BoardCard
                  key={card.id}
                  card={card}
                  currency={hustle.currency}
                  busy={move.isPending}
                  onEdit={() => setEditing({ item: card, stage })}
                  onUp={index > 0 ? () => save(moveInColumn(cards, card.id, -1)) : undefined}
                  onDown={index < cards.length - 1 ? () => save(moveInColumn(cards, card.id, 1)) : undefined}
                  previous={previous === undefined ? undefined : { stage: previous, go: () => moveTo(card, previous) }}
                  next={next === undefined ? undefined : { stage: next, go: () => moveTo(card, next) }}
                />
              ))}
              <Button variant="ghost" size="sm" className="justify-start" onClick={() => setEditing({ item: null, stage })}>
                <Plus aria-hidden />
                Add {words.card}
              </Button>
            </section>
          )
        })}
      </div>
      <ItemDialog hustle={hustle} editing={editing} columns={columns} onClose={() => setEditing(null)} onMoved={offerPayment} />
      <AlertDialog open={paying !== null} onOpenChange={(open) => !open && setPaying(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log the payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {paying && formatMoney(Number(paying.amount), hustle.currency)} for “{paying?.title}”{payingClient ? ` from ${payingClient}` : ''}, as income today. It
              counts toward your profit and earnings per hour.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!paying) return
                logPayment.mutate({
                  hustleId: hustle.id,
                  currency: hustle.currency,
                  id: null,
                  fields: {
                    kind: 'income',
                    amount: Number(paying.amount),
                    occurredOn: dateKeyInTimezone(new Date(), timeZone),
                    clientId: paying.client_id,
                    itemId: paying.id,
                    category: paying.title,
                    note: null,
                  },
                })
              }}
            >
              Log {paying && formatMoney(Number(paying.amount), hustle.currency)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {logPayment.error && (
        <p role="alert" className="text-sm text-destructive">
          {logPayment.error.message}
        </p>
      )}
    </div>
  )
}

interface BoardCardProps {
  card: HustleItem
  currency: string
  busy: boolean
  onEdit: () => void
  onUp?: () => void
  onDown?: () => void
  previous?: { stage: string; go: () => void }
  next?: { stage: string; go: () => void }
}

function BoardCard({ card, currency, busy, onEdit, onUp, onDown, previous, next }: BoardCardProps) {
  const timeZone = useTimezone()
  const link = safeUrl(card.url)
  const details = [card.amount === null ? null : formatMoney(Number(card.amount), card.currency ?? currency), card.due_at ? formatShortDateInTimezone(card.due_at, timeZone) : null].filter(Boolean)
  return (
    <article className="grid gap-1.5 rounded-lg border bg-card p-2.5 shadow-xs">
      <button type="button" className="text-left text-sm font-medium hover:underline" onClick={onEdit}>
        {card.title}
      </button>
      {(details.length > 0 || link) && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {details.join(' · ')}
          {link && (
            <a href={link} target="_blank" rel="noreferrer" aria-label={`Open the link of "${card.title}"`} className="hover:text-foreground">
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </p>
      )}
      <div className="flex gap-0.5">
        <Button variant="ghost" size="icon-xs" aria-label={`Move "${card.title}" up`} disabled={!onUp || busy} onClick={onUp}>
          <ArrowUp aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label={`Move "${card.title}" down`} disabled={!onDown || busy} onClick={onDown}>
          <ArrowDown aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label={previous ? `Move "${card.title}" to ${previous.stage}` : 'First column'} disabled={!previous || busy} onClick={previous?.go}>
          <ArrowLeft aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label={next ? `Move "${card.title}" to ${next.stage}` : 'Last column'} disabled={!next || busy} onClick={next?.go}>
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </article>
  )
}
