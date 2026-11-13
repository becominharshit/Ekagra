import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { TollboothFlow } from '@/features/focus/TollboothFlow'

/** Emergency unlock (/today/focus/tollbooth). On Android, FocusGuard's blocker opens it with ?app=<package>&label=<name>. */
export function TollboothPage() {
  const { t } = useTranslation('focus')
  const [params] = useSearchParams()
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/today/focus">
          <ArrowLeft aria-hidden />
          {t('backToFocus')}
        </Link>
      </Button>
      <PageHeader title={t('tollboothTitle')} subtitle={t('tollboothSubtitle')} />
      <TollboothFlow appPackage={params.get('app')} appLabel={params.get('label')} />
    </>
  )
}
