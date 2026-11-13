import { createContext, useCallback, useContext } from 'react'
import { useNavigate, type NavigateOptions, type To } from 'react-router'

export const StudioBaseContext = createContext('')

export function useStudioBase(): string {
  return useContext(StudioBaseContext)
}

export function useStudioEmbedded(): boolean {
  return useContext(StudioBaseContext) !== ''
}

/** Resolves a Studio-internal path (e.g. `'/'`, `'/subjects/123'`, `'/notes/1?t=30'`) against the active mount prefix. */
export function studioHref(base: string, to: string): string {
  const cleanBase = base.replace(/\/+$/, '')
  if (!cleanBase) return to.startsWith('/') ? to : `/${to}`
  const normalized = to.startsWith('/') ? to : `/${to}`
  if (normalized === '/') return cleanBase
  if (normalized.startsWith('/?')) return `${cleanBase}${normalized.slice(1)}`
  return `${cleanBase}${normalized}`
}

export function useStudioHref(): (to: string) => string {
  const base = useStudioBase()
  return useCallback((to: string) => studioHref(base, to), [base])
}

export function useStudioNavigate() {
  const base = useStudioBase()
  const navigate = useNavigate()
  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === 'number') return navigate(to)
      if (typeof to === 'string') return navigate(studioHref(base, to), options)
      if (to.pathname !== undefined) {
        return navigate({ ...to, pathname: studioHref(base, to.pathname) }, options)
      }
      return navigate(to, options)
    },
    [base, navigate],
  )
}
