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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      affirmation_glows: {
        Row: {
          created_at: string
          event_id: string
          from_user_id: string
          id: string
          note: string | null
          to_user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          from_user_id: string
          id?: string
          note?: string | null
          to_user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          from_user_id?: string
          id?: string
          note?: string | null
          to_user_id?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string
          friend_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      habit_logs: {
        Row: {
          completion: number | null
          completion_type: string
          created_at: string
          date: string | null
          day_index: number | null
          friction_reason: string | null
          habit_id: string
          id: string
          logged_date: string
          note: string | null
          timestamp: number | null
          type: string | null
          user_id: string
          value: number | null
        }
        Insert: {
          completion?: number | null
          completion_type: string
          created_at?: string
          date?: string | null
          day_index?: number | null
          friction_reason?: string | null
          habit_id: string
          id?: string
          logged_date?: string
          note?: string | null
          timestamp?: number | null
          type?: string | null
          user_id: string
          value?: number | null
        }
        Update: {
          completion?: number | null
          completion_type?: string
          created_at?: string
          date?: string | null
          day_index?: number | null
          friction_reason?: string | null
          habit_id?: string
          id?: string
          logged_date?: string
          note?: string | null
          timestamp?: number | null
          type?: string | null
          user_id?: string
          value?: number | null
        }
        Relationships: []
      }
      habits: {
        Row: {
          archived: boolean
          category: string | null
          color: string | null
          created_at: string
          days: boolean[] | null
          fallback_micro_habit: string | null
          id: string
          identity_statement: string | null
          interval_days: number | null
          is_archived: boolean | null
          is_keystone: boolean | null
          time_of_day: string
          micro_days: boolean[] | null
          name: string | null
          priority: string | null
          purpose_anchor: string | null
          schedule: Json
          schedule_type: string | null
          scheduled_days: number[] | null
          tags: string[] | null
          target_days_per_week: number | null
          timestamp: string | null
          title: string
          updated_at: string | null
          user_id: string
          weekly_target_count: number | null
        }
        Insert: {
          archived?: boolean
          category?: string | null
          color?: string | null
          created_at?: string
          days?: boolean[] | null
          fallback_micro_habit?: string | null
          id?: string
          identity_statement?: string | null
          interval_days?: number | null
          is_archived?: boolean | null
          is_keystone?: boolean | null
          time_of_day?: string
          micro_days?: boolean[] | null
          name?: string | null
          priority?: string | null
          purpose_anchor?: string | null
          schedule?: Json
          schedule_type?: string | null
          scheduled_days?: number[] | null
          tags?: string[] | null
          target_days_per_week?: number | null
          timestamp?: string | null
          title: string
          updated_at?: string | null
          user_id: string
          weekly_target_count?: number | null
        }
        Update: {
          archived?: boolean
          category?: string | null
          color?: string | null
          created_at?: string
          days?: boolean[] | null
          fallback_micro_habit?: string | null
          id?: string
          identity_statement?: string | null
          interval_days?: number | null
          is_archived?: boolean | null
          is_keystone?: boolean | null
          time_of_day?: string
          micro_days?: boolean[] | null
          name?: string | null
          priority?: string | null
          purpose_anchor?: string | null
          schedule?: Json
          schedule_type?: string | null
          scheduled_days?: number[] | null
          tags?: string[] | null
          target_days_per_week?: number | null
          timestamp?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
          weekly_target_count?: number | null
        }
        Relationships: []
      }
      momentum_events: {
        Row: {
          event_type: string
          habit_id: string | null
          id: string
          timestamp: string
          time_of_day: string | null
          user_id: string
          weight: number
        }
        Insert: {
          event_type: string
          habit_id?: string | null
          id?: string
          timestamp?: string
          time_of_day?: string | null
          user_id: string
          weight?: number
        }
        Update: {
          event_type?: string
          habit_id?: string | null
          id?: string
          timestamp?: string
          time_of_day?: string | null
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "momentum_events_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      momentum_history: {
        Row: {
          created_at: string
          id: string
          recorded_date: string
          score: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          recorded_date: string
          score: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          recorded_date?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "momentum_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          exam_shield: boolean
          exam_shield_active: boolean | null
          exam_shield_days_used: number | null
          exam_shield_last_deactivated: string | null
          friend_code: string | null
          has_completed_tutorial: boolean | null
          id: string
          interests: string[] | null
          is_guest: boolean | null
          timezone: string | null
          updated_at: string
          username: string | null
          vacation: boolean
          vacation_end_date: string | null
          vacation_mode: boolean | null
          vacation_start_date: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          exam_shield?: boolean
          exam_shield_active?: boolean | null
          exam_shield_days_used?: number | null
          exam_shield_last_deactivated?: string | null
          friend_code?: string | null
          has_completed_tutorial?: boolean | null
          id: string
          interests?: string[] | null
          is_guest?: boolean | null
          timezone?: string | null
          updated_at?: string
          username?: string | null
          vacation?: boolean
          vacation_end_date?: string | null
          vacation_mode?: boolean | null
          vacation_start_date?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          exam_shield?: boolean
          exam_shield_active?: boolean | null
          exam_shield_days_used?: number | null
          exam_shield_last_deactivated?: string | null
          friend_code?: string | null
          has_completed_tutorial?: boolean | null
          id?: string
          interests?: string[] | null
          is_guest?: boolean | null
          timezone?: string | null
          updated_at?: string
          username?: string | null
          vacation?: boolean
          vacation_end_date?: string | null
          vacation_mode?: boolean | null
          vacation_start_date?: string | null
        }
        Relationships: []
      }
      quotes: {
        Row: {
          author: string
          category: string
          created_at: string
          id: string
          quote_text: string
          source_book: string | null
        }
        Insert: {
          author: string
          category: string
          created_at?: string
          id?: string
          quote_text: string
          source_book?: string | null
        }
        Update: {
          author?: string
          category?: string
          created_at?: string
          id?: string
          quote_text?: string
          source_book?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          alert_10min: boolean
          alert_exact: boolean
          created_at: string
          days_of_week: number[] | null
          habit_id: string | null
          id: string
          is_enabled: boolean | null
          notification_id_1: number | null
          notification_id_2: number | null
          target_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_10min?: boolean
          alert_exact?: boolean
          created_at?: string
          days_of_week?: number[] | null
          habit_id?: string | null
          id?: string
          is_enabled?: boolean | null
          notification_id_1?: number | null
          notification_id_2?: number | null
          target_time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_10min?: boolean
          alert_exact?: boolean
          created_at?: string
          days_of_week?: number[] | null
          habit_id?: string | null
          id?: string
          is_enabled?: boolean | null
          notification_id_1?: number | null
          notification_id_2?: number | null
          target_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      connect_by_friend_code: { Args: { target_code: string }; Returns: Json }
      generate_friend_code_from_seed: {
        Args: { seed: string }
        Returns: string
      }
      is_accepted_friendship: {
        Args: { a: string; b: string }
        Returns: boolean
      }
      search_profiles: {
        Args: { query: string }
        Returns: {
          display_name: string
          email: string
          id: string
          username: string
        }[]
      }
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
