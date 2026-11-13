import { useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import { ImagePlus, Layers, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { shrinkPhoto } from '@/lib/files'
import { cn } from '@/lib/utils'
import {
  SAMPLE_OCCLUSION_IMAGE_URL,
  SAMPLE_OCCLUSION_MASKS,
  clampNormalizedBox,
  type OcclusionMask,
} from './occlusion'

export interface ImageOcclusionDraft {
  prompt: string
  imageUrl: string
  masks: OcclusionMask[]
}

interface ImageOcclusionEditorProps {
  value: ImageOcclusionDraft
  onChange: (next: ImageOcclusionDraft) => void
}

/** Interactive builder for creating multi-region Image Occlusion flashcards on desktop and touch devices. */
export function ImageOcclusionEditor({ value, onChange }: ImageOcclusionEditorProps) {
  const [selectedId, setSelectedId] = useState<string>(value.masks[0]?.id ?? '')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [loadingImage, setLoadingImage] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const selectedIndex = Math.max(0, value.masks.findIndex((m) => m.id === selectedId))
  const selected = value.masks[selectedIndex] ?? value.masks[0] ?? null

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploadError(null)
    setLoadingImage(true)
    try {
      const shrunk = await shrinkPhoto(file, 960, 0.75)
      const dataUrl = `data:${shrunk.mimeType};base64,${shrunk.base64}`
      const defaultMask: OcclusionMask = {
        id: crypto.randomUUID().slice(0, 8),
        label: 'Hidden label 1',
        x: 0.35,
        y: 0.35,
        width: 0.25,
        height: 0.14,
      }
      onChange({
        ...value,
        imageUrl: dataUrl,
        masks: [defaultMask],
      })
      setSelectedId(defaultMask.id)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not read that image.')
    } finally {
      setLoadingImage(false)
    }
  }

  function loadSample() {
    setUploadError(null)
    onChange({
      prompt: value.prompt.trim() || 'Identify the masked stage in the web request lifecycle',
      imageUrl: SAMPLE_OCCLUSION_IMAGE_URL,
      masks: SAMPLE_OCCLUSION_MASKS.map((mask) => ({ ...mask })),
    })
    setSelectedId(SAMPLE_OCCLUSION_MASKS[0]!.id)
  }

  function addBoxAt(x = 0.2, y = 0.2) {
    if (value.masks.length >= 12) return
    const nextBox: OcclusionMask = {
      id: crypto.randomUUID().slice(0, 8),
      label: `Hidden label ${value.masks.length + 1}`,
      ...clampNormalizedBox({ x, y, width: 0.22, height: 0.14 }),
    }
    onChange({ ...value, masks: [...value.masks, nextBox] })
    setSelectedId(nextBox.id)
  }

  function handleCanvasClick(event: MouseEvent<HTMLDivElement>) {
    if (!value.imageUrl) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const clickX = (event.clientX - rect.left) / rect.width
    const clickY = (event.clientY - rect.top) / rect.height
    if (!selected) {
      addBoxAt(clickX - 0.11, clickY - 0.07)
      return
    }
    updateMask(selected.id, {
      ...selected,
      ...clampNormalizedBox({
        x: clickX - selected.width / 2,
        y: clickY - selected.height / 2,
        width: selected.width,
        height: selected.height,
      }),
    })
  }

  function updateMask(id: string, nextMask: OcclusionMask) {
    onChange({
      ...value,
      masks: value.masks.map((item) => (item.id === id ? nextMask : item)),
    })
  }

  function removeMask(id: string) {
    if (value.masks.length <= 1) return
    const remaining = value.masks.filter((item) => item.id !== id)
    onChange({ ...value, masks: remaining })
    setSelectedId(remaining[0]?.id ?? '')
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="occ-prompt">Prompt</Label>
        <Input
          id="occ-prompt"
          maxLength={240}
          placeholder="e.g. Identify the masked component in this diagram"
          value={value.prompt}
          onChange={(e) => onChange({ ...value, prompt: e.target.value })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
        <Button type="button" variant="outline" size="sm" disabled={loadingImage} onClick={() => fileRef.current?.click()}>
          <ImagePlus className="size-3.5" aria-hidden />
          {value.imageUrl ? 'Replace diagram image' : 'Upload diagram image'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={loadSample}>
          <Sparkles className="size-3.5 text-mode-study" aria-hidden />
          Use sample diagram
        </Button>
        {value.imageUrl && (
          <Button type="button" variant="outline" size="sm" disabled={value.masks.length >= 12} onClick={() => addBoxAt()}>
            <Plus className="size-3.5" aria-hidden />
            Add box ({value.masks.length}/12)
          </Button>
        )}
      </div>

      {uploadError && (
        <p role="alert" className="text-xs text-destructive">
          {uploadError}
        </p>
      )}

      {value.imageUrl ? (
        <>
          <div className="grid gap-1.5">
            <p className="text-xs text-muted-foreground">Tap or click anywhere on the image to position the selected mask box.</p>
            <div
              role="application"
              aria-label="Diagram box placement canvas"
              onClick={handleCanvasClick}
              className="relative cursor-crosshair overflow-hidden rounded-lg border bg-muted/20"
            >
              <img src={value.imageUrl} alt="Diagram preview" className="block max-h-60 w-full select-none object-contain" />
              <div className="pointer-events-none absolute inset-0">
                {value.masks.map((mask, index) => {
                  const isSelected = selected?.id === mask.id
                  return (
                    <div
                      key={mask.id}
                      style={{
                        left: `${mask.x * 100}%`,
                        top: `${mask.y * 100}%`,
                        width: `${mask.width * 100}%`,
                        height: `${mask.height * 100}%`,
                      }}
                      className={cn(
                        'absolute flex items-center justify-center rounded border-2 text-xs font-semibold',
                        isSelected
                          ? 'border-amber-600 bg-amber-400/80 text-amber-950 shadow-sm'
                          : 'border-slate-500/80 bg-slate-800/65 text-white',
                      )}
                    >
                      #{index + 1}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {value.masks.map((mask, index) => (
              <Button
                key={mask.id}
                type="button"
                size="sm"
                variant={selected?.id === mask.id ? 'default' : 'outline'}
                onClick={() => setSelectedId(mask.id)}
              >
                <Layers className="size-3.5" aria-hidden />
                Box #{index + 1}: {mask.label.slice(0, 18) || 'Unlabeled'}
              </Button>
            ))}
          </div>

          {selected && (
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-end gap-2">
                <div className="grid flex-1 gap-1.5">
                  <Label htmlFor="occ-box-label">Answer for Box #{selectedIndex + 1}</Label>
                  <Input
                    id="occ-box-label"
                    maxLength={160}
                    placeholder="What is hidden under this box?"
                    value={selected.label}
                    onChange={(e) => updateMask(selected.id, { ...selected, label: e.target.value })}
                  />
                </div>
                {value.masks.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove mask box" onClick={() => removeMask(selected.id)}>
                    <Trash2 className="size-4 text-destructive" aria-hidden />
                  </Button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <span className="text-xs text-muted-foreground">Width ({Math.round(selected.width * 100)}%)</span>
                  <Slider
                    min={8}
                    max={60}
                    step={2}
                    value={[Math.round(selected.width * 100)]}
                    onValueChange={([w]) => {
                      const nextW = (w ?? 20) / 100
                      updateMask(selected.id, { ...selected, ...clampNormalizedBox({ ...selected, width: nextW }) })
                    }}
                  />
                </div>
                <div className="grid gap-1.5">
                  <span className="text-xs text-muted-foreground">Height ({Math.round(selected.height * 100)}%)</span>
                  <Slider
                    min={8}
                    max={50}
                    step={2}
                    value={[Math.round(selected.height * 100)]}
                    onValueChange={([h]) => {
                      const nextH = (h ?? 14) / 100
                      updateMask(selected.id, { ...selected, ...clampNormalizedBox({ ...selected, height: nextH }) })
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          Upload a textbook/slide diagram or click <strong>Use sample diagram</strong> to place occlusion boxes.
        </div>
      )}
    </div>
  )
}
