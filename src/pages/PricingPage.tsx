import { useState } from 'react'
import { ArrowLeft, Check, CreditCard, ExternalLink, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/features/auth/authStore'
import {
  PLAN_CATALOG,
  detectDefaultCurrency,
  manageBillingSubscription,
  selectBillingProvider,
  startBillingCheckout,
  useBilling,
  type BillingInterval,
  type CurrencyCode,
  type PlanTier,
} from '@/features/billing/billing'
import { useDataSource } from '@/lib/dataSource'
import { cn } from '@/lib/utils'

const TIERS: PlanTier[] = ['free', 'pro', 'campus']
const CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: 'USD', label: 'USD ($) · Global' },
  { code: 'EUR', label: 'EUR (€) · Europe' },
  { code: 'GBP', label: 'GBP (£) · UK' },
  { code: 'INR', label: 'INR (₹) · India PPP + UPI' },
]

export function PricingPage() {
  const { t } = useTranslation(['billing', 'common'])
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { source } = useDataSource()
  const authStatus = useAuthStore((s) => s.status)
  const billing = useBilling()

  const [currency, setCurrency] = useState<CurrencyCode>(() => detectDefaultCurrency())
  const [interval, setInterval] = useState<BillingInterval>('month')
  const [busyTier, setBusyTier] = useState<'pro' | 'campus' | 'portal' | 'cancel' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(() => {
    const state = searchParams.get('checkout')
    if (state === 'success') return 'Payment received. Your subscription entitlements update within a few seconds.'
    if (state === 'canceled') return 'Checkout was canceled. No charges were made.'
    return null
  })

  const currentTier = billing.data?.tier ?? 'free'
  const subscription = billing.data?.subscription ?? null
  const provider = selectBillingProvider(currency)

  async function handleCheckout(planTier: 'pro' | 'campus') {
    setError(null)
    setNotice(null)
    if (authStatus === 'signed_out' || !source || source.kind === 'demo') {
      navigate('/sign-in')
      return
    }
    setBusyTier(planTier)
    try {
      const base = `${window.location.origin}/pricing`
      const result = await startBillingCheckout(source, {
        planTier,
        interval,
        currency,
        provider,
        successUrl: `${base}?checkout=success`,
        cancelUrl: `${base}?checkout=canceled`,
      })
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl)
        return
      }
      setNotice('Checkout session created. Follow the payment link to complete activation.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout right now.')
    } finally {
      setBusyTier(null)
    }
  }

  async function handleManage(action: 'portal' | 'cancel') {
    if (!source || source.kind !== 'supabase') return
    setError(null)
    setNotice(null)
    setBusyTier(action)
    try {
      const res = await manageBillingSubscription(source, {
        returnUrl: `${window.location.origin}/pricing`,
        action,
      })
      if (res.url) {
        window.location.assign(res.url)
        return
      }
      setNotice(res.message)
      await billing.refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update billing settings.')
    } finally {
      setBusyTier(null)
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-ring"
      >
        {t('common:skipToContent')}
      </a>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to={authStatus === 'signed_out' ? '/sign-in' : '/me'}>
                <ArrowLeft aria-hidden />
                {t('common:back')}
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
              <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="group" aria-label="Billing interval">
              <Button
                type="button"
                size="sm"
                variant={interval === 'month' ? 'default' : 'ghost'}
                onClick={() => setInterval('month')}
              >
                {t('monthly')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={interval === 'year' ? 'default' : 'ghost'}
                onClick={() => setInterval('year')}
              >
                {t('yearlyDiscount')}
              </Button>
            </div>

            <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
              <SelectTrigger className="w-[210px]" aria-label={t('selectCurrency')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((item) => (
                  <SelectItem key={item.code} value={item.code}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {notice && (
          <div role="status" className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
            {notice}
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {subscription && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="size-4" aria-hidden />
                {t('currentSubscription', {
                  provider: subscription.provider === 'razorpay' ? t('providerRazorpay') : t('providerStripe'),
                })}
              </CardTitle>
              <CardDescription>
                Status: <strong className="capitalize">{subscription.status.replace('_', ' ')}</strong>
                {subscription.currentPeriodEnd
                  ? ` · Renews/ends ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                  : ''}
                {subscription.cancelAtPeriodEnd ? ' · Scheduled to cancel at period end' : ''}
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busyTier !== null}
                onClick={() => void handleManage('portal')}
              >
                <ExternalLink aria-hidden />
                {busyTier === 'portal' ? t('openingPortal') : t('manageBilling')}
              </Button>
              {!subscription.cancelAtPeriodEnd && subscription.status !== 'canceled' && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busyTier !== null}
                  onClick={() => void handleManage('cancel')}
                >
                  {busyTier === 'cancel' ? t('canceling') : t('cancelRenewal')}
                </Button>
              )}
            </CardFooter>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => {
            const entry = PLAN_CATALOG[tier]
            const price = entry.prices[currency]
            const shownPrice = interval === 'year' ? price.displayYearly : price.displayMonthly
            const isCurrent = currentTier === tier && authStatus === 'signed_in'
            const highlighted = tier === 'pro'

            return (
              <Card key={tier} className={cn('flex flex-col justify-between', highlighted && 'border-primary shadow-sm')}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-1.5 text-lg">
                      {highlighted && <Sparkles className="size-4 text-primary" aria-hidden />}
                      {entry.name}
                    </CardTitle>
                    {isCurrent ? (
                      <Badge>{t('currentPlan')}</Badge>
                    ) : highlighted ? (
                      <Badge variant="secondary">{t('mostPopular')}</Badge>
                    ) : null}
                  </div>
                  <CardDescription>{entry.tagline}</CardDescription>
                  <div className="pt-2">
                    <span className="text-3xl font-semibold tabular-nums">{shownPrice}</span>
                    {tier !== 'free' && (
                      <span className="ml-1 text-sm text-muted-foreground">{interval === 'year' ? t('perYear') : t('perMonth')}</span>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="flex-1">
                  <ul className="grid gap-2.5 text-sm">
                    {entry.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  {tier === 'free' ? (
                    <Button asChild variant="outline" className="w-full">
                      <Link to={authStatus === 'signed_in' ? '/today' : '/sign-in'}>
                        {authStatus === 'signed_in' ? t('includedInStarter') : t('startFree')}
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant={highlighted ? 'default' : 'outline'}
                      className="w-full"
                      disabled={isCurrent || busyTier !== null}
                      onClick={() => void handleCheckout(tier)}
                    >
                      {isCurrent
                        ? t('activeOnAccount')
                        : busyTier === tier
                          ? t('redirecting')
                          : authStatus === 'signed_out' || source?.kind === 'demo'
                            ? t('signInToUpgrade', { plan: entry.name })
                            : provider === 'razorpay'
                              ? t('upgradeRazorpay')
                              : t('upgradeStripe')}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {provider === 'razorpay' ? t('checkoutFooterRazorpay') : t('checkoutFooterStripe')}
        </p>
      </div>
    </main>
  )
}
