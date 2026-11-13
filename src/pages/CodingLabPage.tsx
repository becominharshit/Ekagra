import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Code2, Download, FilePlus2, LoaderCircle, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { countLabel, DIFFICULTY_LABEL } from '@/features/academics/labels'
import { useAcademicsMutation } from '@/features/academics/subjects'
import { CODING_LANGUAGES, LANGUAGE_SPECS, normalizeCodingLanguage, type CodingLanguage } from '@/features/coding/languages'
import { problemTitle, readCodeTests, STARTER_PROBLEMS } from '@/features/coding/problems'
import {
  addStarterProblems,
  deleteSnippet,
  newScratchFile,
  openProblem,
  useCodeProblems,
  useSnippets,
  type Snippet,
} from '@/features/coding/snippets'
import { useTimezone } from '@/hooks/useNow'
import { checkPyodideOfflineReady, preparePyodideOffline, type PyodideOfflineStatus } from '@/lib/pwa'

/** Multi-language Coding Lab: Python practice problems and free files in Python, JS, TS, and SQL. */
export function CodingLabPage() {
  const { t } = useTranslation(['coding', 'common'])
  const navigate = useNavigate()
  const timeZone = useTimezone()
  const problems = useCodeProblems()
  const snippets = useSnippets()
  const addStarters = useAcademicsMutation<void, number>((source) => addStarterProblems(source))
  const open = useAcademicsMutation(openProblem)
  const create = useAcademicsMutation<CodingLanguage, Snippet>((source, language) => newScratchFile(source, language))
  const remove = useAcademicsMutation(deleteSnippet)
  const [newLanguage, setNewLanguage] = useState<CodingLanguage>('python')
  const [deleting, setDeleting] = useState<Snippet | null>(null)
  const [pyodideOffline, setPyodideOffline] = useState<PyodideOfflineStatus>('not-cached')
  const [downloadingPy, setDownloadingPy] = useState<{ loaded: number; total: number } | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void checkPyodideOfflineReady().then((status) => {
      if (active) setPyodideOffline(status)
    })
    return () => {
      active = false
    }
  }, [])

  async function handleDownloadPython() {
    setDownloadError(null)
    setDownloadingPy({ loaded: 0, total: 5 })
    const outcome = await preparePyodideOffline((loaded, total) => setDownloadingPy({ loaded, total }))
    setDownloadingPy(null)
    if (outcome.ok) {
      setPyodideOffline('ready')
    } else {
      setDownloadError(outcome.error ?? 'Failed to download Python runtime.')
    }
  }

  const fileFor = new Map((snippets.data ?? []).flatMap((snippet) => (snippet.question_id ? [[snippet.question_id, snippet] as const] : [])))
  const freeFiles = (snippets.data ?? []).filter((snippet) => !snippet.question_id)
  const solved = (problems.data ?? []).filter((problem) => fileFor.get(problem.id)?.passed).length
  const error = addStarters.error ?? open.error ?? create.error ?? remove.error ?? problems.error ?? snippets.error
  const goTo = (file: Snippet) => navigate(`/academics/code/${file.id}`)
  const formatRunAt = (iso: string) =>
    new Intl.DateTimeFormat(undefined, { timeZone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/academics">
          <ArrowLeft aria-hidden />
          {t('backToAcademics')}
        </Link>
      </Button>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={create.isPending} onClick={() => create.mutate(newLanguage, { onSuccess: goTo })}>
            <FilePlus2 aria-hidden />
            {t('newFile')}
          </Button>
          <div role="group" aria-label={t('newFileLanguage')} className="flex flex-wrap items-center gap-1.5">
            {CODING_LANGUAGES.map((lang) => (
              <Button
                key={lang}
                type="button"
                size="sm"
                variant={newLanguage === lang ? 'default' : 'outline'}
                aria-pressed={newLanguage === lang}
                onClick={() => setNewLanguage(lang)}
              >
                {LANGUAGE_SPECS[lang].label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 py-1">
            <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />
            {t('offlineInstantOther')}
          </Badge>
          {pyodideOffline === 'ready' ? (
            <Badge variant="secondary" className="gap-1.5 py-1">
              <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />
              {t('offlineReadyPython')}
            </Badge>
          ) : pyodideOffline === 'not-cached' ? (
            <Button type="button" size="sm" variant="outline" disabled={downloadingPy !== null} onClick={() => void handleDownloadPython()}>
              {downloadingPy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
              {downloadingPy ? t('offlineDownloadingPython', downloadingPy) : t('offlineNeedPython')}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{t('offlineNote')}</p>
        {(error || downloadError) && (
          <p role="alert" className="text-sm text-destructive">
            {downloadError ?? error?.message}
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="size-4" aria-hidden />
              {t('practiceProblems')}
            </CardTitle>
            <CardDescription>
              {problems.data && problems.data.length > 0
                ? t('solvedSummary', { solved, total: problems.data.length })
                : t('practiceDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {problems.isPending && <p className="text-sm text-muted-foreground">{t('common:loading')}</p>}
            {problems.data?.length === 0 && (
              <Button variant="outline" className="justify-self-start" disabled={addStarters.isPending} onClick={() => addStarters.mutate()}>
                {addStarters.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
                {t('addStarterProblems', { count: STARTER_PROBLEMS.length })}
              </Button>
            )}
            {problems.data?.map((problem) => {
              const file = fileFor.get(problem.id)
              const statusKey = file?.passed ? 'solved' : file ? 'started' : 'new'
              return (
                <button
                  key={problem.id}
                  type="button"
                  disabled={open.isPending}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40"
                  onClick={() => open.mutate(problem, { onSuccess: goTo })}
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{problemTitle(problem.prompt)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[problem.difficulty ? DIFFICULTY_LABEL[problem.difficulty] : null, countLabel(readCodeTests(problem.tests).length, 'test')]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <Badge variant={statusKey === 'solved' ? 'default' : 'secondary'}>{t(`status.${statusKey}`)}</Badge>
                </button>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('yourFiles')}</CardTitle>
            <CardDescription>{t('yourFilesDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1">
            {snippets.data && freeFiles.length === 0 && <p className="text-sm text-muted-foreground">{t('noFiles')}</p>}
            {freeFiles.map((file) => {
              const langSpec = LANGUAGE_SPECS[normalizeCodingLanguage(file.language)]
              return (
                <div key={file.id} className="flex items-center gap-2">
                  <Link to={`/academics/code/${file.id}`} className="min-w-0 flex-1 rounded-md px-2 py-1.5 hover:bg-muted">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{file.title}</span>
                      <Badge variant="outline" className="shrink-0 text-[11px]">
                        {langSpec.shortLabel}
                      </Badge>
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {file.last_run_at ? t('lastRun', { when: formatRunAt(file.last_run_at) }) : t('notRunYet')}
                    </span>
                  </Link>
                  <Button variant="ghost" size="icon" aria-label={`Delete ${file.title}`} onClick={() => setDeleting(file)}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(isOpen) => !isOpen && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle', { title: deleting?.title ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('keepIt')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) remove.mutate(deleting.id)
                setDeleting(null)
              }}
            >
              {t('deleteAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
