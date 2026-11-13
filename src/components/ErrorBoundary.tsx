import { Component, type ErrorInfo, type ReactNode, useState } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { AlertTriangle, Bug, Home, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  buildIssueReportUrl,
  captureClientError,
  formatDiagnosticSummary,
  resetLocalAppCache,
} from '@/lib/observability'

interface ErrorFallbackViewProps {
  error: unknown
  title?: string
  description?: string
  showHomeLink?: boolean
  onResetState?: () => void
}

function ErrorFallbackView({
  error,
  title = 'Something went wrong',
  description = 'Ekagra hit an unexpected error while rendering this screen. Your saved data is safe.',
  showHomeLink = true,
  onResetState,
}: ErrorFallbackViewProps) {
  const [clearingCache, setClearingCache] = useState(false)
  const [reportFeedback, setReportFeedback] = useState<string | null>(null)
  const details = formatDiagnosticSummary(error)

  async function handleResetCache() {
    setClearingCache(true)
    try {
      await resetLocalAppCache()
      onResetState?.()
      window.location.reload()
    } finally {
      setClearingCache(false)
    }
  }

  async function handleReportIssue() {
    captureClientError(error, { reportedManually: true })
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(details)
        setReportFeedback('Scrubbed diagnostic details copied to your clipboard.')
      }
    } catch {
      // Clipboard may be blocked in non-HTTPS contexts; opening the issue link still works.
    }
    const issueUrl = buildIssueReportUrl(error)
    window.open(issueUrl, '_blank', 'noopener,noreferrer')
  }

  function handleReload() {
    onResetState?.()
    window.location.reload()
  }

  return (
    <div
      role="alert"
      className="flex min-h-[100dvh] w-full items-center justify-center bg-background p-4 text-foreground"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <details className="mb-5 rounded-lg border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">
            Technical details (no personal info)
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px]">{details}</pre>
        </details>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={handleReload} className="gap-2">
            <RefreshCw className="size-4" aria-hidden />
            Reload
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={clearingCache}
            onClick={() => void handleResetCache()}
            className="gap-2"
          >
            <Trash2 className="size-4" aria-hidden />
            {clearingCache ? 'Clearing…' : 'Reset Local Cache'}
          </Button>
          <Button type="button" variant="outline" onClick={() => void handleReportIssue()} className="gap-2">
            <Bug className="size-4" aria-hidden />
            Report Issue
          </Button>
          {showHomeLink && (
            <Button type="button" variant="ghost" asChild className="gap-2">
              <a href="/">
                <Home className="size-4" aria-hidden />
                Home
              </a>
            </Button>
          )}
        </div>

        {reportFeedback && (
          <p role="status" className="mt-3 text-xs text-muted-foreground">
            {reportFeedback}
          </p>
        )}
      </div>
    </div>
  )
}

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: unknown
}

/** Top-level React ErrorBoundary catching unexpected render or lifecycle errors. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    captureClientError(error, {
      componentStack: info.componentStack ?? undefined,
      boundary: 'root',
    })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorFallbackView
          error={this.state.error}
          showHomeLink={false}
          onResetState={() => this.setState({ hasError: false, error: null })}
        />
      )
    }
    return this.props.children
  }
}

/** Route-level fallback used as React Router `errorElement`. */
export function RouteErrorFallback() {
  const error = useRouteError()

  if (isRouteErrorResponse(error)) {
    const title = error.status === 404 ? 'Page not found' : `Error ${error.status}`
    const description =
      error.status === 404
        ? 'That page does not exist or may have moved.'
        : error.statusText || 'We could not load this route.'
    return (
      <ErrorFallbackView
        error={new Error(`${error.status} ${error.statusText}`)}
        title={title}
        description={description}
      />
    )
  }

  captureClientError(error, { boundary: 'route' })
  return <ErrorFallbackView error={error} />
}
