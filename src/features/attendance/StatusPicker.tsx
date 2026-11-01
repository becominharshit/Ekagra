import { Ban, Check, X, type LucideIcon } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ATTENDANCE_STATUSES, STATUS_LABEL, toStatus, type AttendanceStatus } from './attendance'

const ICON: Record<AttendanceStatus, LucideIcon> = { present: Check, absent: X, cancelled: Ban }
const TONE: Record<AttendanceStatus, string> = {
  present: 'data-[state=on]:bg-mode-life/15 data-[state=on]:text-mode-life',
  absent: 'data-[state=on]:bg-destructive/10 data-[state=on]:text-destructive',
  cancelled: '',
}

/**
 * Present / Absent / Cancelled for one class. Tapping the chosen one again takes the mark back (null).
 * `compact` shows only the icons (for lists).
 */
export function StatusPicker({
  value,
  label,
  disabled,
  compact,
  onChange,
}: {
  value: AttendanceStatus | null
  label: string
  disabled?: boolean
  compact?: boolean
  onChange: (status: AttendanceStatus | null) => void
}) {
  return (
    <ToggleGroup type="single" size="sm" variant="outline" value={value ?? ''} disabled={disabled} aria-label={label} onValueChange={(next) => onChange(toStatus(next))}>
      {ATTENDANCE_STATUSES.map((status) => {
        const Icon = ICON[status]
        return (
          <ToggleGroupItem key={status} value={status} aria-label={compact ? STATUS_LABEL[status] : undefined} className={TONE[status]}>
            <Icon aria-hidden />
            {!compact && STATUS_LABEL[status]}
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
