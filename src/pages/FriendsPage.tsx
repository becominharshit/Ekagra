import { format, startOfWeek } from 'date-fns'
import { ArrowLeft, LoaderCircle, Users } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useProfile } from '@/features/profile/queries'
import { GroupsCard } from '@/features/social/GroupsCard'
import { NudgesCard } from '@/features/social/NudgesCard'
import { PartnerCard } from '@/features/social/PartnerCard'
import { SharingCard } from '@/features/social/SharingCard'
import { DEFAULT_SHARING, firstName, toPublished } from '@/features/social/social'
import { saveMyStats, useMyNumbers, useMyStats, useSocialMutation } from '@/features/social/socialData'
import { useNow } from '@/hooks/useNow'
import { useDataSource } from '@/lib/dataSource'

/** Me → Partner and groups (/me/friends): what you share, accountability partners and nudges. */
export function FriendsPage() {
  const { source } = useDataSource()
  const now = useNow(60_000)
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const profile = useProfile()
  const stats = useMyStats()
  const numbers = useMyNumbers(Boolean(stats.data))
  const start = useSocialMutation(saveMyStats)
  const demo = source?.kind === 'demo'
  const name = firstName(profile.data?.full_name)

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/me">
          <ArrowLeft aria-hidden />
          Me
        </Link>
      </Button>
      <PageHeader title="Partner and groups" subtitle="Study with friends: share a few numbers, nudge each other and focus together." />
      <div className="grid gap-4">
        {demo && (
          <p className="rounded-lg bg-muted/50 p-3 text-sm">
            Demo Mode: Aarav and the study group are samples, so you can try everything. Sign in to connect with real friends.
          </p>
        )}
        {stats.isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading…
          </p>
        )}
        {stats.error && (
          <p role="alert" className="text-sm text-destructive">
            {stats.error.message}
          </p>
        )}
        {stats.data === null && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4" aria-hidden />
                Study with friends
              </CardTitle>
              <CardDescription>
                Partners and study groups see a few numbers you pick: by default your name ({name}), your focus minutes this week, your study streak and
                whether you're studying now. You can change these any time; nobody sees anything until you connect with them.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button className="justify-self-start" disabled={start.isPending} onClick={() => start.mutate(toPublished({ ...DEFAULT_SHARING, displayName: name }, null, null))}>
                {start.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
                Start sharing
              </Button>
              {start.error && (
                <p role="alert" className="text-sm text-destructive">
                  {start.error.message}
                </p>
              )}
            </CardContent>
          </Card>
        )}
        {stats.data && (
          <>
            <NudgesCard />
            <PartnerCard weekStart={weekStart} demo={demo} />
            <GroupsCard weekStart={weekStart} />
            <SharingCard key={stats.data.display_name} stats={stats.data} numbers={numbers.data ?? null} />
          </>
        )}
      </div>
    </>
  )
}
