import type { PostgrestError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { dbError } from './dataSource'

const error = (code: string, message: string) => ({ code, message, details: '', hint: '' }) as unknown as PostgrestError

describe('dbError', () => {
  it('asks for db:push when no tables exist yet', () => {
    expect(dbError(error('PGRST205', "Could not find the table 'public.subjects' in the schema cache")).message).toMatch(
      /tables don't exist yet/,
    )
  })

  it('asks for the latest update when a newer table, column or rule is missing', () => {
    expect(dbError(error('PGRST205', "Could not find the table 'public.feedback' in the schema cache")).message).toMatch(/latest update/)
    expect(dbError(error('42P01', 'relation "public.feedback" does not exist')).message).toMatch(/latest update/)
    expect(dbError(error('PGRST204', "Could not find the 'links' column of 'hustles'")).message).toMatch(/latest update/)
    expect(dbError(error('23514', 'new row violates check constraint "hustles_type_check"')).message).toMatch(/latest update/)
  })

  it('passes other errors through', () => {
    expect(dbError(error('23505', 'duplicate key value')).message).toBe('duplicate key value')
  })
})
