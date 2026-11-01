import { lazy, Suspense } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LIFE_TABS, toLifeTab } from '@/features/life/lifeTabs'

// Each tab's code loads when it's first opened, so the phone only downloads the tab in use.
const HabitsTab = lazy(async () => ({ default: (await import('@/features/life/habits/HabitsTab')).HabitsTab }))
const WorkoutsTab = lazy(async () => ({ default: (await import('@/features/life/workouts/WorkoutsTab')).WorkoutsTab }))
const MealsTab = lazy(async () => ({ default: (await import('@/features/life/meals/MealsTab')).MealsTab }))
const SpeakingTab = lazy(async () => ({ default: (await import('@/features/life/speaking/SpeakingTab')).SpeakingTab }))
const HealthTab = lazy(async () => ({ default: (await import('@/features/life/health/HealthTab')).HealthTab }))

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
        <Suspense
          fallback={
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Loading…
            </p>
          }
        >
          {tab === 'habits' && <HabitsTab />}
          {tab === 'workouts' && <WorkoutsTab />}
          {tab === 'meals' && <MealsTab />}
          {tab === 'speaking' && <SpeakingTab />}
          {tab === 'health' && <HealthTab />}
        </Suspense>
        <p className="text-xs text-muted-foreground">Health features give estimates and tips, not medical advice.</p>
      </div>
    </>
  )
}
