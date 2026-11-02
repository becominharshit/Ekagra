import { useState, type ChangeEvent } from 'react'
import { Camera, FileText, LoaderCircle, Type } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { fileToSource } from '@/lib/files'
import { EMPTY_SOURCE, MIN_PDF_TEXT, type SourceDraft } from './source'

interface SourcePickerProps {
  value: SourceDraft
  onChange: (next: SourceDraft) => void
  isDemo: boolean
  /** e.g. "syllabus" or "past paper" */
  what: string
  placeholder: string
}

export function SourcePicker({ value, onChange, isDemo, what, placeholder }: SourcePickerProps) {
  const [reading, setReading] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  function choose(kind: string) {
    if (kind !== 'text' && kind !== 'pdf' && kind !== 'photo') return
    setProblem(null)
    onChange({ ...EMPTY_SOURCE, kind, text: kind === 'text' ? value.text : '' })
  }

  async function readPdf(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    if (!picked) return
    setReading(true)
    setProblem(null)
    try {
      const { readPdfText } = await import('@/lib/pdf')
      const { pages, pageCount } = await readPdfText(await picked.arrayBuffer())
      const text = pages.join('\n\n').trim()
      if (text.replace(/\s/g, '').length >= MIN_PDF_TEXT) {
        const note = pageCount > pages.length ? `Read the first ${pages.length} of ${pageCount} pages on your device.` : `Read ${pageCount} pages on your device.`
        onChange({ kind: 'pdf', text, file: null, note })
      } else if (isDemo) {
        setProblem(`This PDF looks scanned (it has no text in it). Demo Mode can't read it: paste the ${what} as text instead.`)
      } else {
        onChange({ kind: 'pdf', text: '', file: await fileToSource(picked), note: 'This PDF looks scanned, so the AI will read its pages.' })
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Couldn't read that PDF.")
    } finally {
      setReading(false)
    }
  }

  async function readPhoto(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    if (!picked) return
    setProblem(null)
    try {
      onChange({ kind: 'photo', text: '', file: await fileToSource(picked), note: `The AI will read the photo (${picked.name}).` })
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Couldn't read that photo.")
    }
  }

  return (
    <div className="grid gap-3">
      <ToggleGroup type="single" variant="outline" value={value.kind} onValueChange={choose} aria-label={`How to add the ${what}`}>
        <ToggleGroupItem value="text">
          <Type aria-hidden />
          Paste text
        </ToggleGroupItem>
        <ToggleGroupItem value="pdf">
          <FileText aria-hidden />
          PDF
        </ToggleGroupItem>
        <ToggleGroupItem value="photo">
          <Camera aria-hidden />
          Photo
        </ToggleGroupItem>
      </ToggleGroup>

      {value.kind === 'pdf' && (
        <Input type="file" accept="application/pdf" aria-label={`${what} PDF`} disabled={reading} onChange={(event) => void readPdf(event)} />
      )}
      {value.kind === 'photo' &&
        (isDemo ? (
          <p className="text-sm text-muted-foreground">Reading photos needs the AI, which Demo Mode doesn't have. Paste the text instead, or sign in.</p>
        ) : (
          <Input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label={`Photo of the ${what}`} onChange={(event) => void readPhoto(event)} />
        ))}

      {reading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Reading the PDF on your device…
        </p>
      )}
      {value.note && <p className="text-sm text-muted-foreground">{value.note}</p>}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}

      {(value.kind === 'text' || (value.kind === 'pdf' && value.text)) && (
        <Textarea
          aria-label={`${what} text`}
          rows={10}
          placeholder={placeholder}
          value={value.text}
          onChange={(event) => onChange({ ...value, text: event.target.value })}
        />
      )}
    </div>
  )
}
