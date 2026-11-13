import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, LoaderCircle, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { tasksKey } from '@/features/tasks/tasks'
import { useNow, useTimezone } from '@/hooks/useNow'
import { need, useDataSource } from '@/lib/dataSource'
import { dateKeyInTimezone } from '@/lib/timezone'
import { STARTER_PACKS, applyStarterPack, type StarterPackId, type StarterPackResult } from './starterPacks'
import { academicsKey } from './subjects'

/** 1-click track starter packs (works identically in Demo Mode and Supabase). */
export function StarterPackPicker({
  onApplied,
  compact = false,
}: {
  onApplied?: (result: StarterPackResult) => void
  compact?: boolean
}) {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  const now = useNow(60_000)
  const timeZone = useTimezone()
  const today = dateKeyInTimezone(now, timeZone)
  const [appliedId, setAppliedId] = useState<StarterPackId | null>(null)
  const [lastResult, setLastResult] = useState<StarterPackResult | null>(null)

  const apply = useMutation({
    mutationFn: (packId: StarterPackId) => applyStarterPack(need(source), packId, today),
    onSuccess: async (result) => {
      setAppliedId(result.packId)
      setLastResult(result)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: academicsKey(owner) }),
        queryClient.invalidateQueries({ queryKey: tasksKey(owner) }),
      ])
      onApplied?.(result)
    },
  })

  return (
    <div className="grid gap-3">
      <div className={compact ? 'grid gap-2 sm:grid-cols-2' : 'grid gap-2.5 sm:grid-cols-2'}>
        {STARTER_PACKS.map((pack) => {
          const isRunning = apply.isPending && apply.variables === pack.id
          const isDone = appliedId === pack.id
          return (
            <Button
              key={pack.id}
              type="button"
              variant={isDone ? 'secondary' : 'outline'}
              disabled={!source || apply.isPending}
              onClick={() => apply.mutate(pack.id)}
              className="h-auto flex-col items-start gap-1.5 p-3 text-left whitespace-normal"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium">
                  {isRunning ? (
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                  ) : isDone ? (
                    <Check className="size-3.5 text-emerald-600" aria-hidden />
                  ) : (
                    <Sparkles className="size-3.5 text-mode-study" aria-hidden />
                  )}
                  {pack.title}
                </span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {pack.subjects.length} subjects
                </Badge>
              </div>
              {!compact && <span className="text-xs font-normal text-muted-foreground">{pack.tagline}</span>}
            </Button>
          )
        })}
      </div>

      {lastResult && (
        <p role="status" className="text-xs text-muted-foreground">
          {lastResult.subjectsAdded > 0
            ? `Added ${lastResult.subjectsAdded} subjects, ${lastResult.cardsAdded} flashcards, and ${lastResult.tasksAdded} starter tasks.`
            : 'These starter pack subjects are already in your Academics list.'}
        </p>
      )}
      {apply.error && (
        <p role="alert" className="text-xs text-destructive">
          {apply.error.message}
        </p>
      )}
    </div>
  )
}
