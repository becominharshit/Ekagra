import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { BlockedAppsPicker } from '@/features/focus/BlockedAppsPicker'
import { FocusSettingsCard } from '@/features/focus/FocusSettingsCard'
import { PermissionChecklist } from '@/features/focus/PermissionChecklist'

/** Focus and app blocking (/me/focus): FocusGuard's permissions, the apps to block and the focus settings. */
export function FocusSetupPage() {
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/me">
          <ArrowLeft aria-hidden />
          Me
        </Link>
      </Button>
      <PageHeader title="Focus and app blocking" subtitle="FocusGuard blocks the apps you pick while you focus." />
      <div className="grid gap-4">
        <PermissionChecklist />
        <BlockedAppsPicker />
        <FocusSettingsCard />
      </div>
    </>
  )
}
