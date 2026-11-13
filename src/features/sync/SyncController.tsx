import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CloudOff, CloudUpload, LoaderCircle, RefreshCw } from 'lucide-react'
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
import { useAuthStore } from '@/features/auth/authStore'
import {
  discardDemoMergeData,
  getDemoMergeSummary,
  mergeDemoIntoAccount,
  replayQueuedMutations,
  type DemoMergeSummary,
} from '@/lib/offlineSync'
import { isSupabaseConfigured, requireSupabase } from '@/lib/supabase'
import { syncQueue } from '@/lib/syncQueue'
import { useSyncStore } from './syncStore'

/**
 * Coordinates offline mutation replay (IndexedDB -> Supabase via LWW) and prompts the user to
 * merge local Demo Mode data when signing in with a real account.
 */
export function SyncController() {
  const queryClient = useQueryClient()
  const status = useAuthStore((s) => s.status)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const isOnline = useSyncStore((s) => s.isOnline)
  const setOnline = useSyncStore((s) => s.setOnline)
  const setPendingCount = useSyncStore((s) => s.setPendingCount)
  const setSyncing = useSyncStore((s) => s.setSyncing)
  const setNotice = useSyncStore((s) => s.setNotice)
  const setError = useSyncStore((s) => s.setError)
  const demoPromptDismissed = useSyncStore((s) => s.demoPromptDismissed)
  const dismissDemoPrompt = useSyncStore((s) => s.dismissDemoPrompt)

  const [demoSummary, setDemoSummary] = useState<DemoMergeSummary | null>(null)
  const [merging, setMerging] = useState(false)

  const refreshCount = useCallback(async () => {
    const scope = status === 'signed_in' && userId ? userId : status === 'demo' ? 'demo' : undefined
    if (!scope) {
      setPendingCount(0)
      return
    }
    const count = await syncQueue.count(scope)
    setPendingCount(count)
  }, [status, userId, setPendingCount])

  const flushNow = useCallback(async () => {
    if (status !== 'signed_in' || !userId || !isSupabaseConfigured || !isOnline) return
    const pending = await syncQueue.count(userId)
    if (pending === 0) return

    setSyncing(true)
    setError(null)
    try {
      const report = await replayQueuedMutations(requireSupabase(), userId)
      await refreshCount()
      if (report.error) {
        setError(report.error)
      } else if (report.applied > 0 || report.conflicts > 0) {
        const conflictNote = report.conflicts > 0 ? ` (${report.conflicts} newer cloud edit kept)` : ''
        setNotice(`Synced ${report.applied} offline change${report.applied === 1 ? '' : 's'}${conflictNote}.`)
        await queryClient.invalidateQueries()
      }
    } finally {
      setSyncing(false)
    }
  }, [status, userId, isOnline, setSyncing, setError, setNotice, refreshCount, queryClient])

  useEffect(() => {
    void refreshCount()
    const unsub = syncQueue.subscribe(() => {
      void refreshCount()
    })
    return unsub
  }, [refreshCount])

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
      void flushNow()
    }
    function handleOffline() {
      setOnline(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setOnline, flushNow])

  useEffect(() => {
    if (status === 'signed_in' && userId && isOnline) {
      void flushNow()
    }
  }, [status, userId, isOnline, flushNow])

  useEffect(() => {
    let active = true
    if (status !== 'signed_in' || !userId || demoPromptDismissed) {
      return
    }
    void getDemoMergeSummary().then((summary) => {
      if (active) setDemoSummary(summary.hasData ? summary : null)
    })
    return () => {
      active = false
    }
  }, [status, userId, demoPromptDismissed])

  async function handleMergeDemo() {
    if (!userId || !isSupabaseConfigured) return
    setMerging(true)
    setError(null)
    try {
      const result = await mergeDemoIntoAccount(requireSupabase(), userId)
      if (result.error) {
        setError(result.error)
      } else {
        const conflictNote = result.conflicts > 0 ? ` (${result.conflicts} newer cloud row kept via Last-Write-Wins)` : ''
        setNotice(`Merged ${result.mergedRows} local Demo item${result.mergedRows === 1 ? '' : 's'} into your account${conflictNote}.`)
        setDemoSummary(null)
        await queryClient.invalidateQueries()
      }
    } finally {
      setMerging(false)
    }
  }

  async function handleDiscardDemo() {
    setMerging(true)
    try {
      await discardDemoMergeData()
      setDemoSummary(null)
      setNotice('Cleared local Demo Mode data.')
    } finally {
      setMerging(false)
    }
  }

  const open = Boolean(demoSummary?.hasData && !demoPromptDismissed && status === 'signed_in')

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && dismissDemoPrompt()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CloudUpload className="size-5 text-primary" aria-hidden />
            Merge your Demo Mode work?
          </AlertDialogTitle>
          <AlertDialogDescription>
            We found local Demo Mode data on this device (
            {demoSummary ? `${demoSummary.totalRows} saved item${demoSummary.totalRows === 1 ? '' : 's'}` : 'local study data'}
            {demoSummary?.hasOnboardedProfile ? ' plus your onboarding setup' : ''}). Merge it into your cloud account using
            Last-Write-Wins, or discard it?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" disabled={merging} onClick={() => void handleDiscardDemo()}>
            Discard demo data
          </Button>
          <div className="flex gap-2">
            <AlertDialogCancel disabled={merging} onClick={dismissDemoPrompt}>
              Later
            </AlertDialogCancel>
            <AlertDialogAction disabled={merging} onClick={(e) => {
              e.preventDefault()
              void handleMergeDemo()
            }}>
              {merging && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Merge into account
            </AlertDialogAction>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Compact non-blocking status bar shown when offline, queued mutations exist, or sync just completed. */
export function SyncStatusBanner() {
  const status = useAuthStore((s) => s.status)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const isOnline = useSyncStore((s) => s.isOnline)
  const pendingCount = useSyncStore((s) => s.pendingCount)
  const isSyncing = useSyncStore((s) => s.isSyncing)
  const notice = useSyncStore((s) => s.lastSyncedNotice)
  const error = useSyncStore((s) => s.lastError)
  const setNotice = useSyncStore((s) => s.setNotice)
  const setSyncing = useSyncStore((s) => s.setSyncing)
  const setPendingCount = useSyncStore((s) => s.setPendingCount)
  const setError = useSyncStore((s) => s.setError)
  const queryClient = useQueryClient()

  if (status !== 'signed_in') return null
  if (isOnline && pendingCount === 0 && !notice && !error) return null

  async function manualRetry() {
    if (!userId || !isSupabaseConfigured || isSyncing) return
    setSyncing(true)
    setError(null)
    try {
      const report = await replayQueuedMutations(requireSupabase(), userId)
      setPendingCount(await syncQueue.count(userId))
      if (report.error) {
        setError(report.error)
      } else {
        setNotice(`Synced ${report.applied} offline change${report.applied === 1 ? '' : 's'}.`)
        await queryClient.invalidateQueries()
      }
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b bg-muted/60 px-4 py-1.5 text-xs text-muted-foreground"
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 lg:max-w-4xl">
        <div className="flex items-center gap-2">
          {!isOnline && <CloudOff className="size-3.5 shrink-0" aria-hidden />}
          <span>
            {!isOnline
              ? `Offline mode · ${pendingCount} change${pendingCount === 1 ? '' : 's'} saved locally in IndexedDB`
              : error
                ? error
                : pendingCount > 0
                  ? `${pendingCount} offline change${pendingCount === 1 ? '' : 's'} waiting to sync`
                  : notice}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isOnline && pendingCount > 0 && (
            <Button type="button" variant="outline" size="xs" disabled={isSyncing} onClick={() => void manualRetry()}>
              <RefreshCw className={isSyncing ? 'size-3 animate-spin' : 'size-3'} aria-hidden />
              Sync now
            </Button>
          )}
          {notice && pendingCount === 0 && !error && (
            <Button type="button" variant="ghost" size="xs" onClick={() => setNotice(null)}>
              Dismiss
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
