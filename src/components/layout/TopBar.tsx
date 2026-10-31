import { ModeChip } from '@/features/mode/ModeChip'

export function TopBar() {
  return (
    <header className="pt-safe border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-3 px-4">
        <span className="truncate font-heading text-base font-semibold tracking-tight">Student Mentor</span>
        <ModeChip />
      </div>
    </header>
  )
}
