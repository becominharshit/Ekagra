import { useQuery } from '@tanstack/react-query'
import { addMinutes } from 'date-fns'
import { weekStart as weekStartHelper } from '@/features/planner/time'
import { useTimezone } from '@/hooks/useNow'
import { dbError, need, useDataSource, type DataSource } from '@/lib/dataSource'
import { demoDb } from '@/lib/demoDb'
import { resolveTimezone, timePartsInTimezone, zonedLocalToIso } from '@/lib/timezone'
import { groupNameProblem, type GroupView, type Member } from './groups'
import { listBlockedUserIds } from './safety'
import { isCode, normalizeCode, viewOf } from './social'
import { loadSharedViews, SAMPLE_PARTNER_ID, socialKey } from './socialData'

// Study groups, from Supabase or (Demo Mode) the device. Real groups need accounts: Demo Mode shows
// a sample group (with the student in it once they share), and making or joining one says so.

export const SAMPLE_GROUP_ID = 'sample-group'

/** Demo Mode's sample group: members' numbers grow through the week, and each studies at set hours. */
export function sampleGroup(now: Date, timeZone?: string): GroupView {
  const zone = resolveTimezone(timeZone)
  const parts = timePartsInTimezone(now, zone)
  const weekStart = weekStartHelper(parts.date)
  const daysIn = (parts.weekday + 6) % 7
  const hour = parts.hour
  const atHourIso = (value: number) => zonedLocalToIso(parts.date, value * 60, zone)
  const sample = (userId: string, name: string, minutesADay: number, from: number, to: number): Member => {
    const until = hour >= from && hour < to ? atHourIso(to) : null
    return {
      userId,
      name,
      role: userId === 'sample-riya' ? 'owner' : 'member',
      me: false,
      sample: true,
      stats: {
        user_id: userId,
        display_name: name,
        week_start: weekStart,
        focus_minutes: (daysIn + 1) * minutesADay,
        streak_days: 3 + daysIn,
        plan_pct: null,
        on_leaderboard: true,
        studying_until: until,
        studying_now: until !== null,
        updated_at: now.toISOString(),
      },
    }
  }
  const members = [
    sample('sample-riya', 'Riya (sample)', 95, 20, 22),
    sample('sample-kabir', 'Kabir (sample)', 60, 17, 19),
    sample('sample-meera', 'Meera (sample)', 75, 7, 9),
    sample(SAMPLE_PARTNER_ID, 'Aarav (sample)', 80, 19, 21),
  ]
  const mine = demoDb.list('shared_stats')[0]
  if (mine) members.push({ userId: mine.user_id, name: `${mine.display_name} (you)`, role: 'member', me: true, stats: viewOf(mine, now) })
  // Riya starts a 50-minute group focus at the top of each hour from 20:00 to 21:00.
  const startIso = atHourIso(hour)
  const sessions =
    hour >= 20 && hour < 22
      ? [
          {
            id: 'sample-session',
            user_id: 'sample-riya',
            group_id: SAMPLE_GROUP_ID,
            mode: 'custom',
            minutes: 50,
            starts_at: startIso,
            ends_at: addMinutes(new Date(startIso), 50).toISOString(),
            created_at: startIso,
            updated_at: startIso,
          },
        ]
      : []
  return { id: SAMPLE_GROUP_ID, name: 'DBMS study circle (sample)', ownerId: 'sample-riya', code: '9C4E1B7A30', members, sessions, sample: true }
}

export async function listGroups(source: DataSource, now: Date, timeZone?: string): Promise<GroupView[]> {
  const blocked = await listBlockedUserIds(source)
  if (source.kind === 'demo') {
    const group = sampleGroup(now, timeZone)
    return [
      {
        ...group,
        members: group.members.filter((m) => m.me || !blocked.has(m.userId)),
        sessions: group.sessions.filter((s) => !blocked.has(s.user_id)),
      },
    ]
  }
  const { client, userId } = source
  // The rules return only the groups this student is in.
  const { data: groups, error } = await client.from('study_groups').select('id, name, user_id, invite_code').order('created_at')
  if (error) throw dbError(error)
  if (groups.length === 0) return []
  const ids = groups.map((group) => group.id)
  const [members, sessions] = await Promise.all([
    client.from('group_members').select('group_id, user_id, role').in('group_id', ids).order('created_at'),
    client.from('group_sessions').select('*').in('group_id', ids).gt('ends_at', now.toISOString()).order('starts_at', { ascending: false }),
  ])
  if (members.error) throw dbError(members.error)
  if (sessions.error) throw dbError(sessions.error)
  const visibleMembers = members.data.filter((m) => m.user_id === userId || !blocked.has(m.user_id))
  const views = await loadSharedViews(source, [...new Set(visibleMembers.map((member) => member.user_id))])
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    ownerId: group.user_id,
    code: group.invite_code,
    members: visibleMembers
      .filter((member) => member.group_id === group.id)
      .map((member) => {
        const stats = views.get(member.user_id) ?? null
        const me = member.user_id === userId
        const name = stats?.display_name ?? 'Member'
        return { userId: member.user_id, name: me ? `${name} (you)` : name, role: member.role, me, stats }
      }),
    sessions: sessions.data.filter((session) => session.group_id === group.id && !blocked.has(session.user_id)),
  }))
}

const SIGN_IN = "Demo Mode can't make real groups: try the sample group, or sign in to study with friends."

export async function createGroup(source: DataSource, name: string): Promise<void> {
  const problem = groupNameProblem(name)
  if (problem) throw new Error(problem)
  if (source.kind === 'demo') throw new Error(SIGN_IN)
  const { error } = await source.client.from('study_groups').insert({ name: name.trim() })
  if (error) throw dbError(error)
}

export async function joinGroup(source: DataSource, code: string): Promise<void> {
  if (!isCode(code)) throw new Error('Enter the 10-character group code.')
  if (source.kind === 'demo') throw new Error(SIGN_IN)
  const { error } = await source.client.rpc('join_group', { code: normalizeCode(code) })
  if (error) throw dbError(error)
}

export async function leaveGroup(source: DataSource, groupId: string): Promise<void> {
  if (source.kind === 'demo' || groupId === SAMPLE_GROUP_ID) throw new Error('The sample group stays in Demo Mode.')
  const { error } = await source.client.rpc('leave_group', { target: groupId })
  if (error) throw dbError(error)
}

/** A new random code (10 characters), for when the old one went to the wrong people. */
function randomCode(): string {
  return [...crypto.getRandomValues(new Uint8Array(5))].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** The owner makes a new code: the old one stops working. */
export async function newGroupCode(source: DataSource, groupId: string): Promise<void> {
  if (source.kind === 'demo' || groupId === SAMPLE_GROUP_ID) throw new Error('The sample group keeps its code.')
  const { error } = await source.client.from('study_groups').update({ invite_code: randomCode() }).eq('id', groupId)
  if (error) throw dbError(error)
}

/** The owner removes someone from the group. */
export async function removeMember(source: DataSource, { groupId, userId }: { groupId: string; userId: string }): Promise<void> {
  if (source.kind === 'demo' || groupId === SAMPLE_GROUP_ID) throw new Error('The sample group stays as it is in Demo Mode.')
  const { error } = await source.client.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId)
  if (error) throw dbError(error)
}

/** Starts a group focus the others can join until it ends (the sample group has nobody to tell). */
export async function startGroupFocus(source: DataSource, { groupId, minutes, now = new Date() }: { groupId: string; minutes: number; now?: Date }): Promise<void> {
  if (source.kind === 'demo' || groupId === SAMPLE_GROUP_ID) return
  const { error } = await source.client.from('group_sessions').insert({
    group_id: groupId,
    mode: 'custom',
    minutes,
    starts_at: now.toISOString(),
    ends_at: addMinutes(now, minutes).toISOString(),
  })
  if (error) throw dbError(error)
}

export function useGroups(enabled = true) {
  const { source, owner } = useDataSource()
  const timeZone = useTimezone()
  return useQuery({
    queryKey: [...socialKey(owner), 'groups', timeZone],
    queryFn: () => listGroups(need(source), new Date(), timeZone),
    enabled: source !== null && enabled,
    refetchInterval: 60_000,
  })
}
