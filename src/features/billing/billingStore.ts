import { create } from 'zustand'

export interface UpgradeModalState {
  open: boolean
  reason: string | null
  featureLabel: string | null
  openUpgradeModal: (reason?: string | null, featureLabel?: string | null) => void
  closeUpgradeModal: () => void
}

export const useBillingStore = create<UpgradeModalState>((set) => ({
  open: false,
  reason: null,
  featureLabel: null,
  openUpgradeModal: (reason = null, featureLabel = null) =>
    set({ open: true, reason, featureLabel }),
  closeUpgradeModal: () =>
    set({ open: false, reason: null, featureLabel: null }),
}))
