import { LoaderCircle } from 'lucide-react'

/** Shown while the first screen's code downloads (every page is loaded only when it's opened). */
export function PageLoading() {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      Loading…
    </div>
  )
}
