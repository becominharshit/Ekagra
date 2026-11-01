import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { AboutDraft } from './onboardingDraft'

const YEARS = [1, 2, 3, 4, 5]
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/** Step 1: who you are. Only the name is required. */
export function AboutStep({ value, onChange }: { value: AboutDraft; onChange: (next: AboutDraft) => void }) {
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
        <Label htmlFor="college">College</Label>
        <Input
          id="college"
          placeholder="Your college or university"
          value={value.college}
          onChange={(event) => onChange({ ...value, college: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="program">Program</Label>
        <Input
          id="program"
          placeholder="e.g. B.Tech Computer Science"
          value={value.program}
          onChange={(event) => onChange({ ...value, program: event.target.value })}
        />
      </div>
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
        <Label id="semester-label">Semester</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          className="flex-wrap"
          aria-labelledby="semester-label"
          value={value.semester ? String(value.semester) : ''}
          onValueChange={(next) => onChange({ ...value, semester: next ? Number(next) : null })}
        >
          {SEMESTERS.map((semester) => (
            <ToggleGroupItem key={semester} value={String(semester)} aria-label={`Semester ${semester}`}>
              {semester}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  )
}
