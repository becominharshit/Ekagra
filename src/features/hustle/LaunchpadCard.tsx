import { useState } from 'react'
import { ExternalLink, LoaderCircle, Pencil, Plus, Rocket, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useHustleMutation, type Hustle } from './hustles'
import { INTENTIONS, LAUNCHPAD_MINUTES, normalizeUrl, parseLinks, platformsFor, saveLinks } from './launchpad'
import { useLaunchpadStore } from './launchpadStore'
import { toHustleType, type Platform } from './templates'

/** The hustle's outreach and social platforms, each opened with a 10-minute goal. */
export function LaunchpadCard({ hustle }: { hustle: Hustle }) {
  const active = useLaunchpadStore((state) => state.active)
  const [opening, setOpening] = useState<Platform | null>(null)
  const [editing, setEditing] = useState(false)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="size-4" aria-hidden />
          Launchpad
        </CardTitle>
        <CardDescription>Open a platform with a {LAUNCHPAD_MINUTES}-minute goal, so a quick check doesn't turn into an hour of scrolling.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Links
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          {platformsFor(hustle).map((platform) => (
            <Button key={`${platform.label}-${platform.url}`} variant="outline" size="sm" disabled={active !== null} onClick={() => setOpening(platform)}>
              {platform.label}
              <ExternalLink aria-hidden />
            </Button>
          ))}
        </div>
        {active && <p className="text-xs text-muted-foreground">A launch is running ({active.platform}). Finish it at the top of the screen first.</p>}
      </CardContent>
      <Dialog open={opening !== null} onOpenChange={(open) => !open && setOpening(null)}>
        <DialogContent>{opening && <LaunchForm hustle={hustle} platform={opening} onDone={() => setOpening(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">{editing && <LinksForm hustle={hustle} onDone={() => setEditing(false)} />}</DialogContent>
      </Dialog>
    </Card>
  )
}

function LaunchForm({ hustle, platform, onDone }: { hustle: Hustle; platform: Platform; onDone: () => void }) {
  const start = useLaunchpadStore((state) => state.start)
  const [intention, setIntention] = useState('')
  const ideas = INTENTIONS[toHustleType(hustle.type)]

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!intention.trim()) return
        start({
          id: crypto.randomUUID(),
          hustleId: hustle.id,
          hustleName: hustle.name,
          platform: platform.label,
          url: platform.url,
          intention: intention.trim(),
          startedAt: new Date().toISOString(),
          minutes: LAUNCHPAD_MINUTES,
        })
        window.open(platform.url, '_blank', 'noopener,noreferrer')
        onDone()
      }}
    >
      <DialogHeader>
        <DialogTitle>Open {platform.label}</DialogTitle>
        <DialogDescription>What will you do there in the next {LAUNCHPAD_MINUTES} minutes? The timer runs at the top of the app.</DialogDescription>
      </DialogHeader>
      <Input aria-label="Your goal" placeholder={`e.g. ${ideas[0]}`} maxLength={120} value={intention} onChange={(event) => setIntention(event.target.value)} />
      <div className="flex flex-wrap gap-1.5">
        {ideas.map((idea) => (
          <Button key={idea} type="button" size="xs" variant="outline" onClick={() => setIntention(idea)}>
            {idea}
          </Button>
        ))}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={!intention.trim()}>
          <Rocket aria-hidden />
          Start {LAUNCHPAD_MINUTES} minutes and open {platform.label}
        </Button>
      </DialogFooter>
    </form>
  )
}

function LinksForm({ hustle, onDone }: { hustle: Hustle; onDone: () => void }) {
  const save = useHustleMutation(saveLinks)
  const [links, setLinks] = useState<Platform[]>(() => parseLinks(hustle.links))
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  function add() {
    const link = normalizeUrl(url)
    if (!label.trim()) return setProblem('Give the link a name, e.g. "My Upwork profile".')
    if (!link) return setProblem('Enter a web link, e.g. upwork.com/freelancers/you.')
    setProblem(null)
    setLinks([...links, { label: label.trim().slice(0, 40), url: link }])
    setLabel('')
    setUrl('')
  }

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Your links</DialogTitle>
        <DialogDescription>Your own profiles, channel or portfolio. They come first on the Launchpad (a link named like a suggested platform replaces it).</DialogDescription>
      </DialogHeader>
      {links.length > 0 && (
        <ul className="grid gap-1.5">
          {links.map((link, index) => (
            <li key={`${index}-${link.url}`} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {link.label} <span className="text-muted-foreground">{link.url}</span>
              </span>
              <Button variant="ghost" size="icon-xs" aria-label={`Remove ${link.label}`} onClick={() => setLinks(links.filter((_, other) => other !== index))}>
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-[1fr_2fr_auto] items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="link-label">Name</Label>
          <Input id="link-label" maxLength={40} placeholder="Upwork" value={label} onChange={(event) => setLabel(event.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="link-url">Link</Label>
          <Input id="link-url" inputMode="url" maxLength={500} placeholder="upwork.com/freelancers/you" value={url} onChange={(event) => setUrl(event.target.value)} />
        </div>
        <Button type="button" variant="outline" aria-label="Add the link" onClick={add}>
          <Plus aria-hidden />
        </Button>
      </div>
      {(problem ?? save.error) && (
        <p role="alert" className="text-sm text-destructive">
          {problem ?? save.error?.message}
        </p>
      )}
      <DialogFooter>
        <Button disabled={save.isPending} onClick={() => save.mutate({ hustleId: hustle.id, links }, { onSuccess: onDone })}>
          {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          Save links
        </Button>
      </DialogFooter>
    </div>
  )
}
