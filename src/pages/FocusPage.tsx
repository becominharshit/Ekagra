import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { RunningFocus } from '@/features/focus/RunningFocus'
import { useActiveFocus } from '@/features/focus/sessions'
import { StartFocus } from '@/features/focus/StartFocus'

/** The focus timer (/today/focus): pick what to work on and a timer, then the clock while it runs. */
export function FocusPage() {
  const { t } = useTranslation(['focus', 'common'])
  const focus = useActiveFocus()
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/today">
          <ArrowLeft aria-hidden />
          {t('backToToday')}
        </Link>
      </Button>
      <PageHeader title={t('title')} subtitle={focus.data ? t('runningSubtitle') : t('idleSubtitle')} />
      {focus.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {t('common:loading')}
        </p>
      )}
      {focus.error && (
        <p role="alert" className="text-sm text-destructive">
          {focus.error.message}
        </p>
      )}
      {focus.data && <RunningFocus session={focus.data} />}
      {focus.data === null && <StartFocus />}
    </>
  )
}
