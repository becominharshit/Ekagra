// The Life section's tabs, each at its own address (/life/habits, /life/meals, …).

export const LIFE_TABS = [
  { value: 'habits', label: 'Habits' },
  { value: 'workouts', label: 'Workouts' },
  { value: 'meals', label: 'Meals' },
  { value: 'speaking', label: 'Speaking' },
  { value: 'health', label: 'Sleep & steps' },
] as const

export type LifeTab = (typeof LIFE_TABS)[number]['value']

/** The tab in the address, or Habits for anything else. */
export function toLifeTab(value: string | undefined): LifeTab {
  return LIFE_TABS.some((tab) => tab.value === value) ? (value as LifeTab) : 'habits'
}
