import { CircleUser, GraduationCap, HeartPulse, Rocket, Sun, type LucideIcon } from 'lucide-react'

// The app's 5 main sections: the bottom tabs on phones (BottomTabBar), the side menu on wide screens (SideNav).

export interface Tab {
  to: string
  label: string
  icon: LucideIcon
  /** Colour of the tab when it's open (matches its mode colour). */
  activeClass: string
}

export const TABS: Tab[] = [
  { to: '/today', label: 'Today', icon: Sun, activeClass: 'text-foreground' },
  { to: '/academics', label: 'Academics', icon: GraduationCap, activeClass: 'text-mode-study' },
  { to: '/hustle', label: 'Hustle', icon: Rocket, activeClass: 'text-mode-hustle' },
  { to: '/life', label: 'Life', icon: HeartPulse, activeClass: 'text-mode-life' },
  { to: '/me', label: 'Me', icon: CircleUser, activeClass: 'text-foreground' },
]
