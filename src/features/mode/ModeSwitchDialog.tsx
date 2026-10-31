import { useState } from 'react'
import { format } from 'date-fns'
import { TriangleAlert } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MODE_LABEL, MODE_TONE, SWITCH_REASONS, type Mode, type ScheduledBlock, type SwitchReason } from './modes'

interface ModeSwitchDialogProps {
  open: boolean
  /** The block that is running now (what the plan says you should be doing). */
  block: ScheduledBlock | null
  /** The mode of the tab you tried to open. */
  toMode: Mode | null
  onStay: () => void
  onSwitch: (reason: SwitchReason) => void
}

/** The warning shown when you open Hustle during a Study block (or Academics during a Hustle block). */
export function ModeSwitchDialog({ open, block, toMode, onStay, onSwitch }: ModeSwitchDialogProps) {
  const [reason, setReason] = useState<SwitchReason | null>(null)

  if (!block || !toMode) return null

  const planned = MODE_LABEL[block.mode]
  const wanted = MODE_LABEL[toMode]

  function stay() {
    setReason(null)
    onStay()
  }

  function switchAnyway() {
    if (!reason) return
    setReason(null)
    onSwitch(reason)
  }

  return (
    // Closing the dialog in any way (Stay button, Esc key, Android back) means "stay".
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && stay()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className={cn('ring-1 ring-inset', MODE_TONE[block.mode])}>
            <TriangleAlert />
          </AlertDialogMedia>
          <AlertDialogTitle>It's {planned} time</AlertDialogTitle>
          <AlertDialogDescription>
            Your plan says <span className="font-medium text-foreground">{block.title}</span> until{' '}
            {format(new Date(block.endsAt), 'h:mm a')}. Switch to {wanted} anyway?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">Why are you switching?</legend>
          <div className="grid grid-cols-2 gap-2">
            {SWITCH_REASONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={reason === option.value ? 'default' : 'outline'}
                aria-pressed={reason === option.value}
                onClick={() => setReason(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Your reason is saved, so you can spot patterns later.</p>
        </fieldset>

        <AlertDialogFooter>
          <Button type="button" variant="outline" disabled={!reason} onClick={switchAnyway}>
            Switch to {wanted}
          </Button>
          <AlertDialogCancel variant="default">Stay in {planned}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
