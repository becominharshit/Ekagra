// TEMPORARY: written by hand to match supabase/migrations/001_phase1_core.sql.
// It only covers the tables the app uses so far (profiles, routine_blocks).
// After your Supabase project is linked, run `npm run db:types`. That replaces this whole
// file with the full version generated from your real database (same shape, every table).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          avatar_url: string | null
          college: string | null
          program: string | null
          year: number | null
          semester: number | null
          timezone: string
          currency: string
          chronotype: string
          mentor_tone: string
          onboarded_at: string | null
          settings: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          avatar_url?: string | null
          college?: string | null
          program?: string | null
          year?: number | null
          semester?: number | null
          timezone?: string
          currency?: string
          chronotype?: string
          mentor_tone?: string
          onboarded_at?: string | null
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          avatar_url?: string | null
          college?: string | null
          program?: string | null
          year?: number | null
          semester?: number | null
          timezone?: string
          currency?: string
          chronotype?: string
          mentor_tone?: string
          onboarded_at?: string | null
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      routine_blocks: {
        Row: {
          id: string
          user_id: string
          kind: string
          title: string
          days_of_week: number[]
          start_time: string
          end_time: string
          valid_from: string | null
          valid_to: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          kind: string
          title: string
          days_of_week: number[]
          start_time: string
          end_time: string
          valid_from?: string | null
          valid_to?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          kind?: string
          title?: string
          days_of_week?: number[]
          start_time?: string
          end_time?: string
          valid_from?: string | null
          valid_to?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicTables = Database['public']['Tables']

export type Tables<T extends keyof PublicTables> = PublicTables[T]['Row']
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]['Insert']
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]['Update']
