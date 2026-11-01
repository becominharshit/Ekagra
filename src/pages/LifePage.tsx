import { useNavigate, useParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HabitsTab } from '@/features/life/habits/HabitsTab'
import { LIFE_TABS, toLifeTab, type LifeTab } from '@/features/life/lifeTabs'
import { MealsTab } from '@/features/life/meals/MealsTab'
import { WorkoutsTab } from '@/features/life/workouts/WorkoutsTab'

/** What each tab will hold (filled in step by step during Milestone 14). */
const COMING: Record<Exclude<LifeTab, 'habits' | 'workouts' | 'meals'>, string> = {
  speaking: 'A speaking partner for interviews, presentations and group discussions.',
  health: 'Sleep and steps, from Health Connect or typed in.',
}

/** Life (/life/:tab): habits, workouts, meals, speaking practice, sleep and steps. */
export function LifePage() {
  const { tab: param } = useParams()
  const navigate = useNavigate()
  const tab = toLifeTab(param)

  return (
    <>
      <PageHeader title="Life" subtitle="Habits, fitness, food, speaking and sleep: the things that keep you going." />
      <div className="grid gap-4">
        <Tabs value={tab} onValueChange={(next) => navigate(`/life/${next}`, { replace: true })}>
          <TabsList className="w-full overflow-x-auto">
            {LIFE_TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {tab === 'habits' ? (
          <HabitsTab />
        ) : tab === 'workouts' ? (
          <WorkoutsTab />
        ) : tab === 'meals' ? (
          <MealsTab />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Coming in this milestone</CardTitle>
              <CardDescription>{COMING[tab]}</CardDescription>
            </CardHeader>
          </Card>
        )}
        <p className="text-xs text-muted-foreground">Health features give estimates and tips, not medical advice.</p>
      </div>
    </>
  )
}
