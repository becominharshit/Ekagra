export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_anchors: {
        Row: {
          action: string
          created_at: string
          id: string
          material_id: string
          model: string | null
          page_no: number
          prompt_version: string | null
          question: string | null
          rect: Json | null
          response_md: string | null
          selected_text: string | null
          topic_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          material_id: string
          model?: string | null
          page_no: number
          prompt_version?: string | null
          question?: string | null
          rect?: Json | null
          response_md?: string | null
          selected_text?: string | null
          topic_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          material_id?: string
          model?: string | null
          page_no?: number
          prompt_version?: string | null
          question?: string | null
          rect?: Json | null
          response_md?: string | null
          selected_text?: string | null
          topic_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_anchors_material_id_user_id_fkey"
            columns: ["material_id", "user_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "ai_anchors_topic_id_user_id_fkey"
            columns: ["topic_id", "user_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          cost_usd: number
          created_at: string
          feature: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          feature: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cost_usd?: number
          created_at?: string
          feature?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      attempts: {
        Row: {
          answer: Json | null
          created_at: string
          hints_used: number
          id: string
          is_correct: boolean | null
          question_id: string
          quiz_id: string | null
          score: number | null
          time_ms: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          answer?: Json | null
          created_at?: string
          hints_used?: number
          id?: string
          is_correct?: boolean | null
          question_id: string
          quiz_id?: string | null
          score?: number | null
          time_ms?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          answer?: Json | null
          created_at?: string
          hints_used?: number
          id?: string
          is_correct?: boolean | null
          question_id?: string
          quiz_id?: string | null
          score?: number | null
          time_ms?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempts_question_id_user_id_fkey"
            columns: ["question_id", "user_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "attempts_quiz_id_user_id_fkey"
            columns: ["quiz_id", "user_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      attendance: {
        Row: {
          created_at: string
          date: string
          id: string
          start_time: string | null
          status: string
          subject_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          start_time?: string | null
          status: string
          subject_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          start_time?: string | null
          status?: string
          subject_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_subject_id_user_id_fkey"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      blocked_apps: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string | null
          package_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string | null
          package_name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string | null
          package_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          contact: string | null
          created_at: string
          hustle_id: string | null
          id: string
          name: string
          notes: string | null
          platform: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          hustle_id?: string | null
          id?: string
          name: string
          notes?: string | null
          platform?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          hustle_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          platform?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustle_earnings"
            referencedColumns: ["hustle_id", "user_id"]
          },
          {
            foreignKeyName: "clients_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustles"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      code_snippets: {
        Row: {
          code: string
          created_at: string
          id: string
          language: string
          last_output: string | null
          last_run_at: string | null
          passed: boolean | null
          question_id: string | null
          title: string
          topic_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          code?: string
          created_at?: string
          id?: string
          language?: string
          last_output?: string | null
          last_run_at?: string | null
          passed?: boolean | null
          question_id?: string | null
          title?: string
          topic_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          language?: string
          last_output?: string | null
          last_run_at?: string | null
          passed?: boolean | null
          question_id?: string | null
          title?: string
          topic_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "code_snippets_question_id_user_id_fkey"
            columns: ["question_id", "user_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "code_snippets_topic_id_user_id_fkey"
            columns: ["topic_id", "user_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      daily_checkins: {
        Row: {
          checked_in_at: string | null
          crashed_at: string | null
          created_at: string
          date: string
          energy: number | null
          id: string
          minimum_day: boolean
          mood: number | null
          note: string | null
          top_distraction: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checked_in_at?: string | null
          crashed_at?: string | null
          created_at?: string
          date: string
          energy?: number | null
          id?: string
          minimum_day?: boolean
          mood?: number | null
          note?: string | null
          top_distraction?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          checked_in_at?: string | null
          crashed_at?: string | null
          created_at?: string
          date?: string
          energy?: number | null
          id?: string
          minimum_day?: boolean
          mood?: number | null
          note?: string | null
          top_distraction?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      distraction_events: {
        Row: {
          app_package: string | null
          at: string
          created_at: string
          focus_session_id: string | null
          from_mode: string | null
          id: string
          kind: string
          quiz_id: string | null
          reason: string | null
          to_mode: string | null
          unlock_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          app_package?: string | null
          at?: string
          created_at?: string
          focus_session_id?: string | null
          from_mode?: string | null
          id?: string
          kind: string
          quiz_id?: string | null
          reason?: string | null
          to_mode?: string | null
          unlock_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          app_package?: string | null
          at?: string
          created_at?: string
          focus_session_id?: string | null
          from_mode?: string | null
          id?: string
          kind?: string
          quiz_id?: string | null
          reason?: string | null
          to_mode?: string | null
          unlock_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "distraction_events_focus_session_id_user_id_fkey"
            columns: ["focus_session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "focus_sessions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "distraction_events_quiz_id_user_id_fkey"
            columns: ["quiz_id", "user_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      feedback: {
        Row: {
          context: Json
          created_at: string
          id: string
          kind: string
          message: string
          path: string | null
          screen: string | null
          screenshot_path: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          kind: string
          message: string
          path?: string | null
          screen?: string | null
          screenshot_path?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          kind?: string
          message?: string
          path?: string | null
          screen?: string | null
          screenshot_path?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      flashcard_reviews: {
        Row: {
          created_at: string
          duration_ms: number | null
          flashcard_id: string
          id: string
          log: Json | null
          rating: number
          reviewed_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          flashcard_id: string
          id?: string
          log?: Json | null
          rating: number
          reviewed_at?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          flashcard_id?: string
          id?: string
          log?: Json | null
          rating?: number
          reviewed_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_reviews_flashcard_id_user_id_fkey"
            columns: ["flashcard_id", "user_id"]
            isOneToOne: false
            referencedRelation: "flashcards"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      flashcards: {
        Row: {
          anchor_id: string | null
          back: string
          created_at: string
          due_at: string
          front: string
          fsrs: Json
          id: string
          material_id: string | null
          source: string
          suspended: boolean
          topic_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor_id?: string | null
          back: string
          created_at?: string
          due_at?: string
          front: string
          fsrs?: Json
          id?: string
          material_id?: string | null
          source?: string
          suspended?: boolean
          topic_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          anchor_id?: string | null
          back?: string
          created_at?: string
          due_at?: string
          front?: string
          fsrs?: Json
          id?: string
          material_id?: string | null
          source?: string
          suspended?: boolean
          topic_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_anchor_id_user_id_fkey"
            columns: ["anchor_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ai_anchors"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "flashcards_material_id_user_id_fkey"
            columns: ["material_id", "user_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "flashcards_topic_id_user_id_fkey"
            columns: ["topic_id", "user_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      focus_sessions: {
        Row: {
          actual_minutes: number | null
          area: string
          completed: boolean
          created_at: string
          ended_at: string | null
          hustle_id: string | null
          id: string
          mode: string
          outcome: string | null
          plan_block_id: string | null
          planned_minutes: number
          started_at: string
          subject_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_minutes?: number | null
          area: string
          completed?: boolean
          created_at?: string
          ended_at?: string | null
          hustle_id?: string | null
          id?: string
          mode: string
          outcome?: string | null
          plan_block_id?: string | null
          planned_minutes: number
          started_at?: string
          subject_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          actual_minutes?: number | null
          area?: string
          completed?: boolean
          created_at?: string
          ended_at?: string | null
          hustle_id?: string | null
          id?: string
          mode?: string
          outcome?: string | null
          plan_block_id?: string | null
          planned_minutes?: number
          started_at?: string
          subject_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "focus_sessions_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustle_earnings"
            referencedColumns: ["hustle_id", "user_id"]
          },
          {
            foreignKeyName: "focus_sessions_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustles"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "focus_sessions_plan_block_id_user_id_fkey"
            columns: ["plan_block_id", "user_id"]
            isOneToOne: false
            referencedRelation: "plan_blocks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "focus_sessions_subject_id_user_id_fkey"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      hustle_items: {
        Row: {
          amount: number | null
          client_id: string | null
          created_at: string
          currency: string | null
          data: Json
          due_at: string | null
          hustle_id: string
          id: string
          kind: string
          order_index: number
          stage: string
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          client_id?: string | null
          created_at?: string
          currency?: string | null
          data?: Json
          due_at?: string | null
          hustle_id: string
          id?: string
          kind?: string
          order_index?: number
          stage: string
          title: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Update: {
          amount?: number | null
          client_id?: string | null
          created_at?: string
          currency?: string | null
          data?: Json
          due_at?: string | null
          hustle_id?: string
          id?: string
          kind?: string
          order_index?: number
          stage?: string
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hustle_items_client_id_user_id_fkey"
            columns: ["client_id", "user_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "hustle_items_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustle_earnings"
            referencedColumns: ["hustle_id", "user_id"]
          },
          {
            foreignKeyName: "hustle_items_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustles"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      hustle_phases: {
        Row: {
          completed_at: string | null
          created_at: string
          hustle_id: string
          id: string
          order_index: number
          started_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          hustle_id: string
          id?: string
          order_index?: number
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          hustle_id?: string
          id?: string
          order_index?: number
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hustle_phases_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustle_earnings"
            referencedColumns: ["hustle_id", "user_id"]
          },
          {
            foreignKeyName: "hustle_phases_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustles"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      hustle_steps: {
        Row: {
          created_at: string
          done: boolean
          id: string
          order_index: number
          phase_id: string
          skill_name: string | null
          skill_subject_id: string | null
          skill_topic_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          order_index?: number
          phase_id: string
          skill_name?: string | null
          skill_subject_id?: string | null
          skill_topic_id?: string | null
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          order_index?: number
          phase_id?: string
          skill_name?: string | null
          skill_subject_id?: string | null
          skill_topic_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hustle_steps_phase_id_user_id_fkey"
            columns: ["phase_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustle_phases"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "hustle_steps_skill_subject_id_user_id_fkey"
            columns: ["skill_subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "hustle_steps_skill_topic_id_user_id_fkey"
            columns: ["skill_topic_id", "user_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      hustles: {
        Row: {
          created_at: string
          currency: string
          goal: string | null
          goal_amount: number | null
          goal_date: string | null
          id: string
          links: Json
          name: string
          pipeline_stages: string[]
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          goal?: string | null
          goal_amount?: number | null
          goal_date?: string | null
          id?: string
          links?: Json
          name: string
          pipeline_stages?: string[]
          status?: string
          type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          currency?: string
          goal?: string | null
          goal_amount?: number | null
          goal_date?: string | null
          id?: string
          links?: Json
          name?: string
          pipeline_stages?: string[]
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          id: string
          locked_at: string | null
          payload: Json
          run_after: string
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          locked_at?: string | null
          payload?: Json
          run_after?: string
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          locked_at?: string | null
          payload?: Json
          run_after?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lessons: {
        Row: {
          content_md: string
          created_at: string
          id: string
          model: string | null
          prompt_version: string | null
          sources: Json
          topic_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_md: string
          created_at?: string
          id?: string
          model?: string | null
          prompt_version?: string | null
          sources?: Json
          topic_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          content_md?: string
          created_at?: string
          id?: string
          model?: string | null
          prompt_version?: string | null
          sources?: Json
          topic_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_topic_id_user_id_fkey"
            columns: ["topic_id", "user_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      marks: {
        Row: {
          assessment: string
          created_at: string
          date: string | null
          id: string
          max_marks: number
          obtained: number
          subject_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assessment: string
          created_at?: string
          date?: string | null
          id?: string
          max_marks: number
          obtained: number
          subject_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          assessment?: string
          created_at?: string
          date?: string | null
          id?: string
          max_marks?: number
          obtained?: number
          subject_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marks_subject_id_user_id_fkey"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      material_pages: {
        Row: {
          created_at: string
          id: string
          material_id: string
          needs_ocr: boolean
          page_no: number
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          needs_ocr?: boolean
          page_no: number
          text?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          needs_ocr?: boolean
          page_no?: number
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_pages_material_id_user_id_fkey"
            columns: ["material_id", "user_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      material_sections: {
        Row: {
          created_at: string
          id: string
          material_id: string
          order_index: number
          page_end: number | null
          page_start: number | null
          summary: string | null
          title: string
          topic_id: string | null
          ts_end: number | null
          ts_start: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          order_index?: number
          page_end?: number | null
          page_start?: number | null
          summary?: string | null
          title: string
          topic_id?: string | null
          ts_end?: number | null
          ts_start?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          order_index?: number
          page_end?: number | null
          page_start?: number | null
          summary?: string | null
          title?: string
          topic_id?: string | null
          ts_end?: number | null
          ts_start?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_sections_material_id_user_id_fkey"
            columns: ["material_id", "user_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "material_sections_topic_id_user_id_fkey"
            columns: ["topic_id", "user_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      materials: {
        Row: {
          created_at: string
          duration_sec: number | null
          error: string | null
          id: string
          kind: string
          page_count: number | null
          purpose: string
          source_url: string | null
          status: string
          storage_path: string | null
          subject_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_sec?: number | null
          error?: string | null
          id?: string
          kind: string
          page_count?: number | null
          purpose?: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          subject_id?: string | null
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          duration_sec?: number | null
          error?: string | null
          id?: string
          kind?: string
          page_count?: number | null
          purpose?: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          subject_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_subject_id_user_id_fkey"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      mistakes: {
        Row: {
          code_snippet_id: string | null
          concept: string
          correct_approach: string | null
          correct_count: number
          created_at: string
          flashcard_id: string | null
          id: string
          ladder_step: number
          last_correct_on: string | null
          next_review_at: string
          question_id: string | null
          status: string
          topic_id: string | null
          updated_at: string
          user_id: string
          why_wrong: string | null
        }
        Insert: {
          code_snippet_id?: string | null
          concept: string
          correct_approach?: string | null
          correct_count?: number
          created_at?: string
          flashcard_id?: string | null
          id?: string
          ladder_step?: number
          last_correct_on?: string | null
          next_review_at?: string
          question_id?: string | null
          status?: string
          topic_id?: string | null
          updated_at?: string
          user_id?: string
          why_wrong?: string | null
        }
        Update: {
          code_snippet_id?: string | null
          concept?: string
          correct_approach?: string | null
          correct_count?: number
          created_at?: string
          flashcard_id?: string | null
          id?: string
          ladder_step?: number
          last_correct_on?: string | null
          next_review_at?: string
          question_id?: string | null
          status?: string
          topic_id?: string | null
          updated_at?: string
          user_id?: string
          why_wrong?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mistakes_code_snippet_id_user_id_fkey"
            columns: ["code_snippet_id", "user_id"]
            isOneToOne: false
            referencedRelation: "code_snippets"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "mistakes_flashcard_id_user_id_fkey"
            columns: ["flashcard_id", "user_id"]
            isOneToOne: false
            referencedRelation: "flashcards"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "mistakes_question_id_user_id_fkey"
            columns: ["question_id", "user_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "mistakes_topic_id_user_id_fkey"
            columns: ["topic_id", "user_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      past_papers: {
        Row: {
          created_at: string
          exam_type: string | null
          id: string
          material_id: string | null
          subject_id: string
          updated_at: string
          user_id: string
          year: number | null
        }
        Insert: {
          created_at?: string
          exam_type?: string | null
          id?: string
          material_id?: string | null
          subject_id: string
          updated_at?: string
          user_id?: string
          year?: number | null
        }
        Update: {
          created_at?: string
          exam_type?: string | null
          id?: string
          material_id?: string | null
          subject_id?: string
          updated_at?: string
          user_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "past_papers_material_id_user_id_fkey"
            columns: ["material_id", "user_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "past_papers_subject_id_user_id_fkey"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      plan_blocks: {
        Row: {
          actual_minutes: number | null
          area: string
          at_risk: boolean
          created_at: string
          date: string
          end_at: string
          hustle_id: string | null
          id: string
          kind: string
          plan_version: number
          planned_minutes: number
          start_at: string
          status: string
          subject_id: string | null
          task_id: string | null
          title: string
          topic_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_minutes?: number | null
          area: string
          at_risk?: boolean
          created_at?: string
          date: string
          end_at: string
          hustle_id?: string | null
          id?: string
          kind: string
          plan_version?: number
          planned_minutes: number
          start_at: string
          status?: string
          subject_id?: string | null
          task_id?: string | null
          title: string
          topic_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          actual_minutes?: number | null
          area?: string
          at_risk?: boolean
          created_at?: string
          date?: string
          end_at?: string
          hustle_id?: string | null
          id?: string
          kind?: string
          plan_version?: number
          planned_minutes?: number
          start_at?: string
          status?: string
          subject_id?: string | null
          task_id?: string | null
          title?: string
          topic_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_blocks_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustle_earnings"
            referencedColumns: ["hustle_id", "user_id"]
          },
          {
            foreignKeyName: "plan_blocks_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustles"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "plan_blocks_subject_id_user_id_fkey"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "plan_blocks_task_id_user_id_fkey"
            columns: ["task_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "plan_blocks_topic_id_user_id_fkey"
            columns: ["topic_id", "user_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          chronotype: string
          college: string | null
          created_at: string
          currency: string
          full_name: string | null
          id: string
          mentor_tone: string
          onboarded_at: string | null
          program: string | null
          semester: number | null
          settings: Json
          timezone: string
          updated_at: string
          year: number | null
        }
        Insert: {
          avatar_url?: string | null
          chronotype?: string
          college?: string | null
          created_at?: string
          currency?: string
          full_name?: string | null
          id: string
          mentor_tone?: string
          onboarded_at?: string | null
          program?: string | null
          semester?: number | null
          settings?: Json
          timezone?: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          avatar_url?: string | null
          chronotype?: string
          college?: string | null
          created_at?: string
          currency?: string
          full_name?: string | null
          id?: string
          mentor_tone?: string
          onboarded_at?: string | null
          program?: string | null
          semester?: number | null
          settings?: Json
          timezone?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      questions: {
        Row: {
          answer: Json | null
          created_at: string
          difficulty: number | null
          explanation: string | null
          id: string
          marks: number | null
          options: Json | null
          past_paper_id: string | null
          prompt: string
          prompt_version: string | null
          rating: number | null
          source: string
          source_ref: Json | null
          subject_id: string | null
          tests: Json | null
          topic_id: string | null
          type: string
          updated_at: string
          user_id: string
          year: number | null
        }
        Insert: {
          answer?: Json | null
          created_at?: string
          difficulty?: number | null
          explanation?: string | null
          id?: string
          marks?: number | null
          options?: Json | null
          past_paper_id?: string | null
          prompt: string
          prompt_version?: string | null
          rating?: number | null
          source: string
          source_ref?: Json | null
          subject_id?: string | null
          tests?: Json | null
          topic_id?: string | null
          type: string
          updated_at?: string
          user_id?: string
          year?: number | null
        }
        Update: {
          answer?: Json | null
          created_at?: string
          difficulty?: number | null
          explanation?: string | null
          id?: string
          marks?: number | null
          options?: Json | null
          past_paper_id?: string | null
          prompt?: string
          prompt_version?: string | null
          rating?: number | null
          source?: string
          source_ref?: Json | null
          subject_id?: string | null
          tests?: Json | null
          topic_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_past_paper_id_user_id_fkey"
            columns: ["past_paper_id", "user_id"]
            isOneToOne: false
            referencedRelation: "past_papers"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "questions_subject_id_user_id_fkey"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "questions_topic_id_user_id_fkey"
            columns: ["topic_id", "user_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      quizzes: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          kind: string
          score: number | null
          started_at: string
          subject_id: string | null
          time_limit_sec: number | null
          topic_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          kind: string
          score?: number | null
          started_at?: string
          subject_id?: string | null
          time_limit_sec?: number | null
          topic_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          kind?: string
          score?: number | null
          started_at?: string
          subject_id?: string | null
          time_limit_sec?: number | null
          topic_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_subject_id_user_id_fkey"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      routine_blocks: {
        Row: {
          created_at: string
          days_of_week: number[]
          end_time: string
          id: string
          kind: string
          start_time: string
          subject_id: string | null
          title: string
          updated_at: string
          user_id: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          days_of_week: number[]
          end_time: string
          id?: string
          kind: string
          start_time: string
          subject_id?: string | null
          title: string
          updated_at?: string
          user_id?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          days_of_week?: number[]
          end_time?: string
          id?: string
          kind?: string
          start_time?: string
          subject_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routine_blocks_subject_id_user_id_fkey"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      semester_results: {
        Row: {
          created_at: string
          credits: number
          id: string
          semester: number
          sgpa: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits: number
          id?: string
          semester: number
          sgpa: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          semester?: number
          sgpa?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          archived_at: string | null
          code: string | null
          color: string | null
          created_at: string
          credits: number | null
          exam_date: string | null
          exam_date_estimated: boolean
          grade: string | null
          id: string
          kind: string
          name: string
          semester: number | null
          updated_at: string
          user_id: string
          weekly_minutes_limit: number | null
        }
        Insert: {
          archived_at?: string | null
          code?: string | null
          color?: string | null
          created_at?: string
          credits?: number | null
          exam_date?: string | null
          exam_date_estimated?: boolean
          grade?: string | null
          id?: string
          kind?: string
          name: string
          semester?: number | null
          updated_at?: string
          user_id?: string
          weekly_minutes_limit?: number | null
        }
        Update: {
          archived_at?: string | null
          code?: string | null
          color?: string | null
          created_at?: string
          credits?: number | null
          exam_date?: string | null
          exam_date_estimated?: boolean
          grade?: string | null
          id?: string
          kind?: string
          name?: string
          semester?: number | null
          updated_at?: string
          user_id?: string
          weekly_minutes_limit?: number | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          area: string
          completed_at: string | null
          created_at: string
          due_at: string | null
          est_minutes: number | null
          hustle_id: string | null
          id: string
          notes: string | null
          priority: number
          source: string
          source_ref: string | null
          status: string
          subject_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          area?: string
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          est_minutes?: number | null
          hustle_id?: string | null
          id?: string
          notes?: string | null
          priority?: number
          source?: string
          source_ref?: string | null
          status?: string
          subject_id?: string | null
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          area?: string
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          est_minutes?: number | null
          hustle_id?: string | null
          id?: string
          notes?: string | null
          priority?: number
          source?: string
          source_ref?: string | null
          status?: string
          subject_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustle_earnings"
            referencedColumns: ["hustle_id", "user_id"]
          },
          {
            foreignKeyName: "tasks_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustles"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "tasks_subject_id_user_id_fkey"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      time_entries: {
        Row: {
          client_id: string | null
          created_at: string
          ended_at: string | null
          focus_session_id: string | null
          hustle_id: string
          id: string
          minutes: number
          note: string | null
          source: string
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          ended_at?: string | null
          focus_session_id?: string | null
          hustle_id: string
          id?: string
          minutes: number
          note?: string | null
          source?: string
          started_at: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          ended_at?: string | null
          focus_session_id?: string | null
          hustle_id?: string
          id?: string
          minutes?: number
          note?: string | null
          source?: string
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_client_id_user_id_fkey"
            columns: ["client_id", "user_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "time_entries_focus_session_id_user_id_fkey"
            columns: ["focus_session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "focus_sessions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "time_entries_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustle_earnings"
            referencedColumns: ["hustle_id", "user_id"]
          },
          {
            foreignKeyName: "time_entries_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustles"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      topic_prereqs: {
        Row: {
          created_at: string
          id: string
          prereq_topic_id: string
          topic_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          prereq_topic_id: string
          topic_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          prereq_topic_id?: string
          topic_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_prereqs_prereq_topic_id_user_id_fkey"
            columns: ["prereq_topic_id", "user_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "topic_prereqs_topic_id_user_id_fkey"
            columns: ["topic_id", "user_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      topics: {
        Row: {
          created_at: string
          difficulty: number | null
          est_minutes: number | null
          exam_weight: number
          id: string
          last_asked_year: number | null
          mastery: number
          order_index: number
          parent_id: string | null
          priority_score: number
          pyq_count: number
          pyq_marks_share: number
          source: string
          status: string
          subject_id: string
          target_date: string | null
          title: string
          track: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: number | null
          est_minutes?: number | null
          exam_weight?: number
          id?: string
          last_asked_year?: number | null
          mastery?: number
          order_index?: number
          parent_id?: string | null
          priority_score?: number
          pyq_count?: number
          pyq_marks_share?: number
          source?: string
          status?: string
          subject_id: string
          target_date?: string | null
          title: string
          track?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          difficulty?: number | null
          est_minutes?: number | null
          exam_weight?: number
          id?: string
          last_asked_year?: number | null
          mastery?: number
          order_index?: number
          parent_id?: string | null
          priority_score?: number
          pyq_count?: number
          pyq_marks_share?: number
          source?: string
          status?: string
          subject_id?: string
          target_date?: string | null
          title?: string
          track?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topics_parent_id_user_id_fkey"
            columns: ["parent_id", "user_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "topics_subject_id_user_id_fkey"
            columns: ["subject_id", "user_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category: string | null
          client_id: string | null
          created_at: string
          currency: string
          hustle_id: string
          hustle_item_id: string | null
          id: string
          kind: string
          note: string | null
          occurred_on: string
          source: string
          source_ref: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          currency?: string
          hustle_id: string
          hustle_item_id?: string | null
          id?: string
          kind: string
          note?: string | null
          occurred_on?: string
          source?: string
          source_ref?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          currency?: string
          hustle_id?: string
          hustle_item_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          occurred_on?: string
          source?: string
          source_ref?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_client_id_user_id_fkey"
            columns: ["client_id", "user_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustle_earnings"
            referencedColumns: ["hustle_id", "user_id"]
          },
          {
            foreignKeyName: "transactions_hustle_id_user_id_fkey"
            columns: ["hustle_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustles"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_hustle_item_id_user_id_fkey"
            columns: ["hustle_item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "hustle_items"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Views: {
      hustle_earnings: {
        Row: {
          currency: string | null
          earnings_per_hour: number | null
          expense: number | null
          hours_logged: number | null
          hustle_id: string | null
          income: number | null
          minutes_logged: number | null
          name: string | null
          net_profit: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
