import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CURRICULUM_LIST, getCurriculumProfile } from '@/features/academics/curriculum'
import { SUPPORTED_CURRENCIES } from '@/lib/currency'
import { COMMON_TIMEZONES } from '@/lib/timezone'
import type { AboutDraft, RegionDraft } from './onboardingDraft'

const YEARS = [1, 2, 3, 4, 5]
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/** Step 1: who you are, plus your curriculum system, currency, and timezone. */
export function AboutStep({
  value,
  region,
  onChange,
  onRegionChange,
}: {
  value: AboutDraft
  region?: RegionDraft
  onChange: (next: AboutDraft) => void
  onRegionChange?: (next: RegionDraft) => void
}) {
  const activeRegion: RegionDraft = region ?? { curriculum: 'us_gpa', currency: 'USD', timezone: 'UTC' }
  const activeCurriculum = getCurriculumProfile(activeRegion.curriculum)
  const timezoneOptions = COMMON_TIMEZONES.includes(activeRegion.timezone)
    ? COMMON_TIMEZONES
    : [activeRegion.timezone, ...COMMON_TIMEZONES]

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="full-name">Your name</Label>
        <Input
          id="full-name"
          autoComplete="name"
          value={value.fullName}
          onChange={(event) => onChange({ ...value, fullName: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="college">School or university</Label>
        <Input
          id="college"
          placeholder="Your school, college, or university"
          value={value.college}
          onChange={(event) => onChange({ ...value, college: event.target.value })}
        />
      </div>
      {region && onRegionChange && (
        <div className="grid gap-2">
          <Label htmlFor="curriculum">Curriculum &amp; grading scale</Label>
          <Select
            value={region.curriculum}
            onValueChange={(next) =>
              onRegionChange({ ...region, curriculum: getCurriculumProfile(next).id })
            }
          >
            <SelectTrigger id="curriculum">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRICULUM_LIST.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{activeCurriculum.description}</p>
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="program">Program</Label>
        <Input
          id="program"
          placeholder={activeCurriculum.programPlaceholder}
          value={value.program}
          onChange={(event) => onChange({ ...value, program: event.target.value })}
        />
      </div>
      {region && onRegionChange && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="currency">Currency</Label>
            <Select value={region.currency} onValueChange={(currency) => onRegionChange({ ...region, currency })}>
              <SelectTrigger id="currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((item) => (
                  <SelectItem key={item.code} value={item.code}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select value={region.timezone} onValueChange={(timezone) => onRegionChange({ ...region, timezone })}>
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezoneOptions.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      <div className="grid gap-2">
        <Label id="year-label">Year</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby="year-label"
          value={value.year ? String(value.year) : ''}
          onValueChange={(next) => onChange({ ...value, year: next ? Number(next) : null })}
        >
          {YEARS.map((year) => (
            <ToggleGroupItem key={year} value={String(year)} aria-label={`Year ${year}`}>
              {year}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="grid gap-2">
        <Label id="semester-label">Term / Semester</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          className="flex-wrap"
          aria-labelledby="semester-label"
          value={value.semester ? String(value.semester) : ''}
          onValueChange={(next) => onChange({ ...value, semester: next ? Number(next) : null })}
        >
          {SEMESTERS.map((semester) => (
            <ToggleGroupItem key={semester} value={String(semester)} aria-label={`Term ${semester}`}>
              {semester}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  )
}
