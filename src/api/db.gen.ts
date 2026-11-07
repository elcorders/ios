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
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          cohort_id: string | null
          created_at: string
          id: string
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          cohort_id?: string | null
          created_at?: string
          id?: string
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          cohort_id?: string | null
          created_at?: string
          id?: string
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_secrets: {
        Row: {
          cohort_id: string
          course_key: string
          created_at: string
          updated_at: string
        }
        Insert: {
          cohort_id: string
          course_key: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          cohort_id?: string
          course_key?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_secrets_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: true
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          batch: string
          code: string
          created_at: string
          id: string
          lms_course_id: string
          settings: Json
          status: Database["public"]["Enums"]["cohort_status"]
          updated_at: string
        }
        Insert: {
          batch: string
          code: string
          created_at?: string
          id?: string
          lms_course_id: string
          settings?: Json
          status?: Database["public"]["Enums"]["cohort_status"]
          updated_at?: string
        }
        Update: {
          batch?: string
          code?: string
          created_at?: string
          id?: string
          lms_course_id?: string
          settings?: Json
          status?: Database["public"]["Enums"]["cohort_status"]
          updated_at?: string
        }
        Relationships: []
      }
      enrolments: {
        Row: {
          cohort_id: string
          created_at: string
          group_id: string | null
          id: string
          role: Database["public"]["Enums"]["enrolment_role"]
          status: Database["public"]["Enums"]["enrolment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cohort_id: string
          created_at?: string
          group_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["enrolment_role"]
          status?: Database["public"]["Enums"]["enrolment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cohort_id?: string
          created_at?: string
          group_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["enrolment_role"]
          status?: Database["public"]["Enums"]["enrolment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrolments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          cohort_id: string
          created_at: string
          id: string
          name: string
          no: number
        }
        Insert: {
          cohort_id: string
          created_at?: string
          id?: string
          name: string
          no: number
        }
        Update: {
          cohort_id?: string
          created_at?: string
          id?: string
          name?: string
          no?: number
        }
        Relationships: [
          {
            foreignKeyName: "groups_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_landing_attempts: {
        Row: {
          created_at: string
          email: string
          id: number
          scope: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: never
          scope: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: never
          scope?: string
        }
        Relationships: []
      }
      pending_registrations: {
        Row: {
          cohort_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          email: string
          first_name: string
          id: string
          idnumber: string | null
          last_name: string
          lms_username: string | null
          status: Database["public"]["Enums"]["pending_status"]
        }
        Insert: {
          cohort_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email: string
          first_name?: string
          id?: string
          idnumber?: string | null
          last_name?: string
          lms_username?: string | null
          status?: Database["public"]["Enums"]["pending_status"]
        }
        Update: {
          cohort_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email?: string
          first_name?: string
          id?: string
          idnumber?: string | null
          last_name?: string
          lms_username?: string | null
          status?: Database["public"]["Enums"]["pending_status"]
        }
        Relationships: [
          {
            foreignKeyName: "pending_registrations_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_registrations_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          first_name: string
          id: string
          index_no: string | null
          is_admin: boolean
          last_name: string
          lms_username: string | null
          phone: string | null
          updated_at: string
          whatsapp_opt_in: boolean
        }
        Insert: {
          created_at?: string
          email: string
          first_name?: string
          id: string
          index_no?: string | null
          is_admin?: boolean
          last_name?: string
          lms_username?: string | null
          phone?: string | null
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          index_no?: string | null
          is_admin?: boolean
          last_name?: string
          lms_username?: string | null
          phone?: string | null
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Relationships: []
      }
      survey_responses: {
        Row: {
          cohort_id: string
          enrolment_id: string
          has_mac: boolean
          submitted_at: string
          user_id: string
        }
        Insert: {
          cohort_id: string
          enrolment_id: string
          has_mac: boolean
          submitted_at?: string
          user_id: string
        }
        Update: {
          cohort_id?: string
          enrolment_id?: string
          has_mac?: boolean
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_responses_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: true
            referencedRelation: "enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      totp_attempts: {
        Row: {
          created_at: string
          email: string
          id: string
          ok: boolean
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ok: boolean
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ok?: boolean
        }
        Relationships: []
      }
      totp_factors: {
        Row: {
          created_at: string
          id: string
          key_version: number
          last_step: number
          secret_ciphertext: string
          status: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key_version?: number
          last_step?: number
          secret_ciphertext: string
          status: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key_version?: number
          last_step?: number
          secret_ciphertext?: string
          status?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "totp_factors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_cohorts: { Args: never; Returns: Json[] }
      admin_list_members: {
        Args: {
          p_cohort_id: string
          p_role?: Database["public"]["Enums"]["enrolment_role"]
        }
        Returns: Json[]
      }
      admin_list_survey: { Args: { p_cohort_id: string }; Returns: Json }
      admin_reject_pending: { Args: { p_pending_id: string }; Returns: Json }
      admin_set_enrolment_status: {
        Args: {
          p_enrolment_id: string
          p_status: Database["public"]["Enums"]["enrolment_status"]
        }
        Returns: Json
      }
      admin_update_cohort_settings: {
        Args: { p_cohort_id: string; p_patch: Json }
        Returns: Json
      }
      admin_update_profile: {
        Args: {
          p_first_name: string
          p_index_no: string
          p_last_name: string
          p_lms_username: string
          p_phone: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_upsert_cohort: {
        Args: {
          p_batch: string
          p_code: string
          p_course_key: string
          p_id: string
          p_lms_course_id: string
          p_status: Database["public"]["Enums"]["cohort_status"]
        }
        Returns: Json
      }
      app_error: {
        Args: { p_code: string; p_detail?: string; p_hint?: string }
        Returns: undefined
      }
      audit: {
        Args: {
          p_action: string
          p_after: Json
          p_before: Json
          p_cohort_id: string
          p_table: string
          p_target: string
        }
        Returns: undefined
      }
      audit_as: {
        Args: {
          p_action: string
          p_actor: string
          p_after: Json
          p_before: Json
          p_cohort_id: string
          p_table: string
          p_target: string
        }
        Returns: undefined
      }
      cohort_json: {
        Args: { c: Database["public"]["Tables"]["cohorts"]["Row"] }
        Returns: Json
      }
      enrolment_json: {
        Args: { e: Database["public"]["Tables"]["enrolments"]["Row"] }
        Returns: Json
      }
      get_me: { Args: never; Returns: Json }
      has_role: {
        Args: {
          p_cohort_id: string
          p_role: Database["public"]["Enums"]["enrolment_role"]
        }
        Returns: boolean
      }
      instructs_user: { Args: { p_user_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_member: { Args: { p_cohort_id: string }; Returns: boolean }
      iso_colombo: { Args: { p_ts: string }; Returns: string }
      lms_landing: {
        Args: {
          p_course_id: string
          p_email: string
          p_first: string
          p_idnumber: string
          p_key: string
          p_last: string
          p_username: string
        }
        Returns: Json
      }
      member_json: {
        Args: { e: Database["public"]["Tables"]["enrolments"]["Row"] }
        Returns: Json
      }
      normalize_phone: { Args: { p: string }; Returns: string }
      pending_approve_finish: {
        Args: { p_actor: string; p_pending_id: string; p_user_id: string }
        Returns: Json
      }
      pending_approve_prepare: { Args: { p_pending_id: string }; Returns: Json }
      pending_json: {
        Args: {
          r: Database["public"]["Tables"]["pending_registrations"]["Row"]
        }
        Returns: Json
      }
      profile_json: {
        Args: { p: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: Json
      }
      roster_apply_row: {
        Args: {
          p_action?: string
          p_actor: string
          p_cohort_id: string
          p_role: Database["public"]["Enums"]["enrolment_role"]
          p_row: Json
          p_user_id: string
        }
        Returns: Json
      }
      roster_diff: {
        Args: {
          p_cohort_id: string
          p_role: Database["public"]["Enums"]["enrolment_role"]
          p_rows: Json
        }
        Returns: Json
      }
      roster_lookup_user: { Args: { p_email: string }; Returns: string }
      security_summary: { Args: { p_user_id: string }; Returns: Json }
      submit_survey: {
        Args: { p_cohort_id: string; p_has_mac: boolean }
        Returns: Json
      }
      totp_activate: {
        Args: { p_factor_id: string; p_step: number }
        Returns: boolean
      }
      totp_admin_reset: {
        Args: { p_actor: string; p_user_id: string; p_what: string }
        Returns: Json
      }
      totp_consume_step: {
        Args: { p_factor_id: string; p_step: number }
        Returns: boolean
      }
      totp_enrol_upsert: {
        Args: { p_ciphertext: string; p_key_version: number; p_user_id: string }
        Returns: Json
      }
      totp_log_attempt: {
        Args: { p_email: string; p_ok: boolean }
        Returns: undefined
      }
      totp_login_lookup: { Args: { p_email: string }; Returns: Json }
      totp_pending_get: { Args: { p_user_id: string }; Returns: Json }
      totp_recent_failures: { Args: { p_email: string }; Returns: number }
      totp_user_email: { Args: { p_user_id: string }; Returns: string }
    }
    Enums: {
      cohort_status: "active" | "archived"
      enrolment_role: "student" | "instructor"
      enrolment_status: "active" | "removed"
      pending_status: "pending" | "approved" | "rejected"
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
    Enums: {
      cohort_status: ["active", "archived"],
      enrolment_role: ["student", "instructor"],
      enrolment_status: ["active", "removed"],
      pending_status: ["pending", "approved", "rejected"],
    },
  },
} as const
