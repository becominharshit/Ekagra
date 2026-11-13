import { Sparkles, Zap } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PLAN_CATALOG } from '@/features/billing/billing'
import { useBillingStore } from '@/features/billing/billingStore'

/**
 * Soft upgrade prompt opened automatically when a free-tier user hits their daily/monthly AI limit
 * or tries a gated Pro capability.
 */
export function UpgradeModal() {
  const navigate = useNavigate()
  const open = useBillingStore((s) => s.open)
  const reason = useBillingStore((s) => s.reason)
  const featureLabel = useBillingStore((s) => s.featureLabel)
  const close = useBillingStore((s) => s.closeUpgradeModal)

  function goToPricing() {
    close()
    navigate('/pricing')
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? close() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="size-3" aria-hidden />
              Ekagra Pro
            </Badge>
            {featureLabel && <span className="text-xs text-muted-foreground">{featureLabel}</span>}
          </div>
          <DialogTitle>Unlock 10x AI headroom and full offline sync</DialogTitle>
          <DialogDescription>
            {reason ?? "You've reached the Starter plan limit. Upgrade to Ekagra Pro for priority AI models, multi-language Coding Lab, and cloud sync."}
          </DialogDescription>
        </DialogHeader>

        <ul className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
          {PLAN_CATALOG.pro.features.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <Zap className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Maybe later
          </Button>
          <Button type="button" onClick={goToPricing}>
            View plans & pricing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
