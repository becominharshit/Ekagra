import { useState } from 'react'
import { Frown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DISTRACTION_REASONS, useLogDistraction } from './distractions'

/** "I got distracted": one tap on what pulled you away (or a few words), noted for the evening check-in. */
export function DistractionButton({ sessionId, onNoted }: { sessionId: string; onNoted: (reason: string) => void }) {
  const [open, setOpen] = useState(false)
  const [other, setOther] = useState('')
  const log = useLogDistraction()
  const note = (reason: string) =>
    log.mutate(
      { sessionId, reason },
      {
        onSuccess: () => {
          setOpen(false)
          setOther('')
          onNoted(reason.trim())
        },
      },
    )

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Frown aria-hidden />I got distracted
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What pulled you away?</DialogTitle>
            <DialogDescription>Noticing it is the first step. It's noted for your evening check-in, and the timer keeps going.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {DISTRACTION_REASONS.map((reason) => (
              <Button key={reason} variant="outline" className="h-auto py-2 whitespace-normal" disabled={log.isPending} onClick={() => note(reason)}>
                {reason}
              </Button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (other.trim()) note(other)
            }}
          >
            <Input aria-label="Something else" placeholder="Something else" maxLength={80} value={other} onChange={(event) => setOther(event.target.value)} />
            <Button type="submit" variant="outline" disabled={!other.trim() || log.isPending}>
              Note it
            </Button>
          </form>
          {log.error && (
            <p role="alert" className="text-sm text-destructive">
              {log.error.message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
