import { ArrowLeft } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { TollboothFlow } from '@/features/focus/TollboothFlow'

/** Emergency unlock (/today/focus/tollbooth). On Android, FocusGuard's blocker opens it with ?app=<package>&label=<name>. */
export function TollboothPage() {
  const [params] = useSearchParams()
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/today/focus">
          <ArrowLeft aria-hidden />
          Focus
        </Link>
      </Button>
      <PageHeader title="Emergency unlock" subtitle="The Academic Tollbooth" />
      <TollboothFlow appPackage={params.get('app')} appLabel={params.get('label')} />
    </>
  )
}
