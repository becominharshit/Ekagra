import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import type { Tables } from '@/types/database'

export const ABUSE_CATEGORIES = ['harassment', 'spam', 'inappropriate_content', 'impersonation', 'other'] as const
export type AbuseCategory = (typeof ABUSE_CATEGORIES)[number]
export type AbuseContextType = 'profile' | 'partner' | 'group' | 'nudge'

export const ABUSE_CATEGORY_LABEL: Record<AbuseCategory, string> = {
  harassment: 'Harassment or bullying',
  spam: 'Spam or unwanted invites',
  inappropriate_content: 'Inappropriate content',
  impersonation: 'Impersonation',
  other: 'Other safety concern',
}

export interface BlockedUserEntry {
  id: string
  blockedUserId: string
  displayName: string | null
  reason: string | null
  createdAt: string
}

export type AbuseReportRow = Tables<'abuse_reports'>

export interface DemoAbuseReport {
  id: string
  reportedUserId: string
  reportedName: string | null
  category: AbuseCategory
  contextType: AbuseContextType
  contextId: string | null
  details: string | null
  status: 'open' | 'reviewed' | 'resolved'
  createdAt: string
}

interface DemoSafetyStore {
  blocked: BlockedUserEntry[]
  reports: DemoAbuseReport[]
}

const DEMO_SAFETY_KEY = 'ekagra-demo-social-safety'
export const safetyKey = (owner: string | null) => ['social', owner, 'safety'] as const
const allSocialKey = (owner: string | null) => ['social', owner] as const

function readDemoSafety(): DemoSafetyStore {
  try {
    const raw = globalThis.localStorage.getItem(DEMO_SAFETY_KEY)
    if (!raw) return { blocked: [], reports: [] }
    const parsed = JSON.parse(raw) as Partial<DemoSafetyStore>
    return {
      blocked: Array.isArray(parsed.blocked) ? parsed.blocked : [],
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
    }
  } catch {
    return { blocked: [], reports: [] }
  }
}

function writeDemoSafety(next: DemoSafetyStore): void {
  globalThis.localStorage.setItem(DEMO_SAFETY_KEY, JSON.stringify(next))
}

export function clearDemoSafetyForTest(): void {
  globalThis.localStorage.removeItem(DEMO_SAFETY_KEY)
}

export async function listBlockedUsers(source: DataSource): Promise<BlockedUserEntry[]> {
  if (source.kind === 'demo') return readDemoSafety().blocked
  const { data, error } = await source.client
    .from('blocked_users')
    .select('id, blocked_user_id, reason, created_at')
    .eq('user_id', source.userId)
    .order('created_at', { ascending: false })
  if (error) throw dbError(error)
  return data.map((row) => ({
    id: row.id,
    blockedUserId: row.blocked_user_id,
    displayName: null,
    reason: row.reason,
    createdAt: row.created_at,
  }))
}

export async function listBlockedUserIds(source: DataSource): Promise<Set<string>> {
  const entries = await listBlockedUsers(source)
  return new Set(entries.map((entry) => entry.blockedUserId))
}

export async function blockUser(
  source: DataSource,
  { targetUserId, displayName, reason }: { targetUserId: string; displayName?: string | null; reason?: string | null },
): Promise<void> {
  const trimmedReason = reason?.trim().slice(0, 300) || null
  if (source.kind === 'demo') {
    const store = readDemoSafety()
    if (store.blocked.some((b) => b.blockedUserId === targetUserId)) return
    store.blocked.unshift({
      id: crypto.randomUUID(),
      blockedUserId: targetUserId,
      displayName: displayName?.trim() || null,
      reason: trimmedReason,
      createdAt: new Date().toISOString(),
    })
    writeDemoSafety(store)
    return
  }
  const { error } = await source.client.from('blocked_users').upsert(
    {
      blocked_user_id: targetUserId,
      reason: trimmedReason,
    },
    { onConflict: 'user_id,blocked_user_id', ignoreDuplicates: true },
  )
  if (error) throw dbError(error)
}

export async function unblockUser(source: DataSource, targetUserId: string): Promise<void> {
  if (source.kind === 'demo') {
    const store = readDemoSafety()
    writeDemoSafety({ ...store, blocked: store.blocked.filter((b) => b.blockedUserId !== targetUserId) })
    return
  }
  const { error } = await source.client.from('blocked_users').delete().eq('user_id', source.userId).eq('blocked_user_id', targetUserId)
  if (error) throw dbError(error)
}

export async function listAbuseReports(source: DataSource): Promise<DemoAbuseReport[]> {
  if (source.kind === 'demo') return readDemoSafety().reports
  const { data, error } = await source.client
    .from('abuse_reports')
    .select('id, reported_user_id, category, context_type, context_id, details, status, created_at')
    .eq('user_id', source.userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw dbError(error)
  return data.map((row) => ({
    id: row.id,
    reportedUserId: row.reported_user_id,
    reportedName: null,
    category: (ABUSE_CATEGORIES.includes(row.category as AbuseCategory) ? row.category : 'other') as AbuseCategory,
    contextType: (row.context_type as AbuseContextType) || 'partner',
    contextId: row.context_id,
    details: row.details,
    status: (row.status as DemoAbuseReport['status']) || 'open',
    createdAt: row.created_at,
  }))
}

export async function submitAbuseReport(
  source: DataSource,
  input: {
    reportedUserId: string
    reportedName?: string | null
    category: AbuseCategory
    contextType: AbuseContextType
    contextId?: string | null
    details?: string | null
    alsoBlock?: boolean
  },
): Promise<void> {
  const details = input.details?.trim().slice(0, 2000) || null
  if (!ABUSE_CATEGORIES.includes(input.category)) {
    throw new Error('Choose a report category.')
  }
  if (source.kind === 'demo') {
    const store = readDemoSafety()
    store.reports.unshift({
      id: crypto.randomUUID(),
      reportedUserId: input.reportedUserId,
      reportedName: input.reportedName?.trim() || null,
      category: input.category,
      contextType: input.contextType,
      contextId: input.contextId ?? null,
      details,
      status: 'open',
      createdAt: new Date().toISOString(),
    })
    writeDemoSafety(store)
  } else {
    const { error } = await source.client.from('abuse_reports').insert({
      reported_user_id: input.reportedUserId,
      category: input.category,
      context_type: input.contextType,
      context_id: input.contextId ?? null,
      details,
    })
    if (error) throw dbError(error)
  }

  if (input.alsoBlock) {
    await blockUser(source, {
      targetUserId: input.reportedUserId,
      displayName: input.reportedName ?? null,
      reason: `Reported: ${ABUSE_CATEGORY_LABEL[input.category]}`,
    })
  }
}

export function useBlockedUsers() {
  const { source, owner } = useDataSource()
  return useQuery({
    queryKey: [...safetyKey(owner), 'blocked'],
    queryFn: () => listBlockedUsers(need(source)),
    enabled: source !== null,
  })
}

export function useSafetyMutation<Variables, Result = void>(run: (source: DataSource, variables: Variables) => Promise<Result>) {
  const { source, owner } = useDataSource()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: Variables) => run(need(source), variables),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: allSocialKey(owner) })
    },
  })
}
