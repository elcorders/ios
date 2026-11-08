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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
      content_items: {
        Row: {
          body_html: string
          cohort_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["content_kind"]
          position: number
          published_at: string | null
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body_html: string
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["content_kind"]
          position?: number
          published_at?: string | null
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["content_kind"]
          position?: number
          published_at?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          cohort_id: string | null
          created_at: string
          id: string
          kind: string
          last_error: string | null
          payload: Json
          ref_id: string
          ref_table: string
          sent_at: string | null
          status: Database["public"]["Enums"]["outbox_status"]
          to_email: string
          to_name: string
        }
        Insert: {
          attempts?: number
          cohort_id?: string | null
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          payload: Json
          ref_id: string
          ref_table: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          to_email: string
          to_name?: string
        }
        Update: {
          attempts?: number
          cohort_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          payload?: Json
          ref_id?: string
          ref_table?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          to_email?: string
          to_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
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
      profile_previous_emails: {
        Row: {
          email: string
          id: string
          replaced_at: string
          replaced_by: string | null
          user_id: string
        }
        Insert: {
          email: string
          id?: string
          replaced_at?: string
          replaced_by?: string | null
          user_id: string
        }
        Update: {
          email?: string
          id?: string
          replaced_at?: string
          replaced_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_previous_emails_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_previous_emails_user_id_fkey"
            columns: ["user_id"]
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
      transfer_requests: {
        Row: {
          admin_note: string | null
          closed_by: string | null
          cohort_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_group_id: string | null
          enrolment_id: string
          from_group_id: string
          id: string
          pref1_group_id: string
          pref2_group_id: string
          reason: string
          status: Database["public"]["Enums"]["transfer_status"]
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          closed_by?: string | null
          cohort_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_group_id?: string | null
          enrolment_id: string
          from_group_id: string
          id?: string
          pref1_group_id: string
          pref2_group_id: string
          reason: string
          status?: Database["public"]["Enums"]["transfer_status"]
          user_id: string
        }
        Update: {
          admin_note?: string | null
          closed_by?: string | null
          cohort_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_group_id?: string | null
          enrolment_id?: string
          from_group_id?: string
          id?: string
          pref1_group_id?: string
          pref2_group_id?: string
          reason?: string
          status?: Database["public"]["Enums"]["transfer_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_requests_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_decided_group_id_fkey"
            columns: ["decided_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_from_group_id_fkey"
            columns: ["from_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_pref1_group_id_fkey"
            columns: ["pref1_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_pref2_group_id_fkey"
            columns: ["pref2_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_user_id_fkey"
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
      admin_approve_swap: {
        Args: { p_note?: string; p_request_a: string; p_request_b: string }
        Returns: Json
      }
      admin_copy_tutorials: {
        Args: { p_from_cohort_id: string; p_to_cohort_id: string }
        Returns: Json
      }
      admin_decide_transfer: {
        Args: {
          p_approve: boolean
          p_group_no?: number
          p_note?: string
          p_request_id: string
        }
        Returns: Json
      }
      admin_delete_content: { Args: { p_id: string }; Returns: Json }
      admin_get_content: { Args: { p_id: string }; Returns: Json }
      admin_list_cohorts: { Args: never; Returns: Json[] }
      admin_list_content: {
        Args: {
          p_cohort_id?: string
          p_kind: Database["public"]["Enums"]["content_kind"]
        }
        Returns: Json
      }
      admin_list_members: {
        Args: {
          p_cohort_id: string
          p_role?: Database["public"]["Enums"]["enrolment_role"]
        }
        Returns: Json[]
      }
      admin_list_survey: { Args: { p_cohort_id: string }; Returns: Json }
      admin_list_transfers: { Args: { p_cohort_id: string }; Returns: Json }
      admin_move_student: {
        Args: { p_enrolment_id: string; p_group_no: number; p_note?: string }
        Returns: Json
      }
      admin_reject_pending: { Args: { p_pending_id: string }; Returns: Json }
      admin_set_content_publish: {
        Args: { p_id: string; p_published_at?: string }
        Returns: Json
      }
      admin_set_enrolment_status: {
        Args: {
          p_enrolment_id: string
          p_status: Database["public"]["Enums"]["enrolment_status"]
        }
        Returns: Json
      }
      admin_set_pending_status: {
        Args: {
          p_pending_id: string
          p_status: Database["public"]["Enums"]["pending_status"]
        }
        Returns: Json
      }
      admin_transfer_row_json: {
        Args: { t: Database["public"]["Tables"]["transfer_requests"]["Row"] }
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
      admin_upsert_content: {
        Args: {
          p_body_html: string
          p_cohort_id: string
          p_id: string
          p_kind: Database["public"]["Enums"]["content_kind"]
          p_position: number
          p_summary: string
          p_title: string
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
      cancel_transfer: { Args: { p_request_id: string }; Returns: Json }
      cohort_json: {
        Args: { c: Database["public"]["Tables"]["cohorts"]["Row"] }
        Returns: Json
      }
      content_admin_json: {
        Args: { p_item: Database["public"]["Tables"]["content_items"]["Row"] }
        Returns: Json
      }
      content_audit_json: {
        Args: { p_item: Database["public"]["Tables"]["content_items"]["Row"] }
        Returns: Json
      }
      content_status: {
        Args: { p_item: Database["public"]["Tables"]["content_items"]["Row"] }
        Returns: string
      }
      content_visible: {
        Args: { p_item: Database["public"]["Tables"]["content_items"]["Row"] }
        Returns: boolean
      }
      email_change_check: {
        Args: { p_email: string; p_user_id: string }
        Returns: Json
      }
      email_change_finish: {
        Args: { p_actor: string; p_email: string; p_user_id: string }
        Returns: Json
      }
      enrolment_json: {
        Args: { e: Database["public"]["Tables"]["enrolments"]["Row"] }
        Returns: Json
      }
      get_content: { Args: { p_id: string }; Returns: Json }
      get_me: { Args: never; Returns: Json }
      get_my_transfers: { Args: { p_cohort_id: string }; Returns: Json }
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
      list_content: {
        Args: { p_kind: Database["public"]["Enums"]["content_kind"] }
        Returns: Json
      }
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
      outbox_claim: {
        Args: { p_limit: number }
        Returns: {
          attempts: number
          cohort_id: string | null
          created_at: string
          id: string
          kind: string
          last_error: string | null
          payload: Json
          ref_id: string
          ref_table: string
          sent_at: string | null
          status: Database["public"]["Enums"]["outbox_status"]
          to_email: string
          to_name: string
        }[]
        SetofOptions: {
          from: "*"
          to: "email_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      outbox_enqueue: {
        Args: {
          p_cohort_id: string
          p_from_no: number
          p_kind: string
          p_note: string
          p_ref_id: string
          p_ref_table: string
          p_to_no: number
          p_user_id: string
        }
        Returns: undefined
      }
      outbox_mark: {
        Args: {
          p_error?: string
          p_id: string
          p_status: Database["public"]["Enums"]["outbox_status"]
        }
        Returns: Json
      }
      outbox_pending_count: { Args: never; Returns: number }
      outbox_reset_failed: { Args: never; Returns: number }
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
      request_transfer: {
        Args: {
          p_cohort_id: string
          p_pref1_no: number
          p_pref2_no: number
          p_reason: string
        }
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
      roster_match_user: {
        Args: { p_email: string; p_index_no: string }
        Returns: string
      }
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
      transfer_approve_one: {
        Args: {
          p_note: string
          p_req_id: string
          p_to: Database["public"]["Tables"]["groups"]["Row"]
        }
        Returns: undefined
      }
      transfer_group_stats: { Args: { p_cohort_id: string }; Returns: Json }
      transfer_json: {
        Args: { t: Database["public"]["Tables"]["transfer_requests"]["Row"] }
        Returns: Json
      }
      transfer_row_by_id: { Args: { p_id: string }; Returns: Json }
    }
    Enums: {
      cohort_status: "active" | "archived"
      content_kind: "resource" | "tutorial"
      enrolment_role: "student" | "instructor"
      enrolment_status: "active" | "removed" | "discarded"
      outbox_status: "queued" | "sent" | "failed" | "skipped"
      pending_status: "pending" | "approved" | "rejected" | "discarded"
      transfer_status: "open" | "approved" | "rejected" | "cancelled"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      cohort_status: ["active", "archived"],
      content_kind: ["resource", "tutorial"],
      enrolment_role: ["student", "instructor"],
      enrolment_status: ["active", "removed", "discarded"],
      outbox_status: ["queued", "sent", "failed", "skipped"],
      pending_status: ["pending", "approved", "rejected", "discarded"],
      transfer_status: ["open", "approved", "rejected", "cancelled"],
    },
  },
} as const
