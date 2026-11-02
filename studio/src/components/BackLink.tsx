import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

/** The small "← Library" (or subject) link at the top of a page. */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 max-w-full">
      <Link to={to}>
        <ArrowLeft aria-hidden />
        <span className="truncate">{label}</span>
      </Link>
    </Button>
  )
}
