import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/features/auth/authStore'
import { ModeChip } from '@/features/mode/ModeChip'

export function TopBar() {
  const isDemo = useAuthStore((state) => state.status === 'demo')

  return (
    <header className="pt-safe border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-heading text-base font-semibold tracking-tight">Ekagra</span>
          {isDemo && <Badge variant="secondary">Demo</Badge>}
        </div>
        <ModeChip />
      </div>
    </header>
  )
}
