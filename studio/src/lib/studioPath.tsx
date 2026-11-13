import { useMemo, type ComponentProps, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { StudioBaseContext, studioHref, useStudioBase } from './studioHref'

/** Provides the mount prefix (`''` for standalone Studio, `'/studio'` when embedded inside Ekagra). */
export function StudioBaseProvider({ base, children }: { base: string; children: ReactNode }) {
  const normalized = base.replace(/\/+$/, '')
  return <StudioBaseContext.Provider value={normalized}>{children}</StudioBaseContext.Provider>
}

type StudioLinkProps = Omit<ComponentProps<typeof Link>, 'to'> & { to: string }

export function StudioLink({ to, ...props }: StudioLinkProps) {
  const base = useStudioBase()
  const resolved = useMemo(() => studioHref(base, to), [base, to])
  return <Link to={resolved} {...props} />
}

type StudioNavLinkProps = Omit<ComponentProps<typeof NavLink>, 'to'> & { to: string }

export function StudioNavLink({ to, ...props }: StudioNavLinkProps) {
  const base = useStudioBase()
  const resolved = useMemo(() => studioHref(base, to), [base, to])
  return <NavLink to={resolved} {...props} />
}
