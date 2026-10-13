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
      automation_executions: {
        Row: {
          attempts: number
          automation_id: string
          completed_at: string | null
          created_at: string
          current_step: number
          id: string
          last_error: string | null
          lead_id: string | null
          next_run_at: string
          pending_reply_at: string | null
          phone: string
          replied: boolean
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          automation_id: string
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          last_error?: string | null
          lead_id?: string | null
          next_run_at?: string
          pending_reply_at?: string | null
          phone: string
          replied?: boolean
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          automation_id?: string
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          last_error?: string | null
          lead_id?: string | null
          next_run_at?: string
          pending_reply_at?: string | null
          phone?: string
          replied?: boolean
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_executions_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_logs: {
        Row: {
          created_at: string
          data: Json | null
          event: string
          execution_id: string | null
          id: string
          status: string | null
          step_id: string | null
        }
        Insert: {
          created_at?: string
          data?: Json | null
          event: string
          execution_id?: string | null
          id?: string
          status?: string | null
          step_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json | null
          event?: string
          execution_id?: string | null
          id?: string
          status?: string | null
          step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "automation_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_steps: {
        Row: {
          automation_id: string
          config: Json
          created_at: string
          id: string
          order_index: number
          type: string
        }
        Insert: {
          automation_id: string
          config?: Json
          created_at?: string
          id?: string
          order_index: number
          type: string
        }
        Update: {
          automation_id?: string
          config?: Json
          created_at?: string
          id?: string
          order_index?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_steps_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          created_at: string
          id: string
          name: string
          status: string
          trigger: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: string
          trigger?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: string
          trigger?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_info: {
        Row: {
          content: string
          fallback_reply: string
          id: boolean
          updated_at: string
        }
        Insert: {
          content?: string
          fallback_reply?: string
          id?: boolean
          updated_at?: string
        }
        Update: {
          content?: string
          fallback_reply?: string
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      contact_ai: {
        Row: {
          assigned_at: string | null
          assigned_name: string | null
          assigned_to: string | null
          last_reply_at: string | null
          paused: boolean
          pending_reply_at: string | null
          phone: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_name?: string | null
          assigned_to?: string | null
          last_reply_at?: string | null
          paused?: boolean
          pending_reply_at?: string | null
          phone: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_name?: string | null
          assigned_to?: string | null
          last_reply_at?: string | null
          paused?: boolean
          pending_reply_at?: string | null
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      evolution_config: {
        Row: {
          api_key: string
          api_url: string
          enabled: boolean
          id: boolean
          instance_name: string
          updated_at: string
        }
        Insert: {
          api_key?: string
          api_url?: string
          enabled?: boolean
          id?: boolean
          instance_name?: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          api_url?: string
          enabled?: boolean
          id?: boolean
          instance_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      global_reply_settings: {
        Row: {
          context_messages: number
          enabled: boolean
          id: boolean
          min_interval_seconds: number
          reply_existing: boolean
          reply_new_leads: boolean
          updated_at: string
        }
        Insert: {
          context_messages?: number
          enabled?: boolean
          id?: boolean
          min_interval_seconds?: number
          reply_existing?: boolean
          reply_new_leads?: boolean
          updated_at?: string
        }
        Update: {
          context_messages?: number
          enabled?: boolean
          id?: boolean
          min_interval_seconds?: number
          reply_existing?: boolean
          reply_new_leads?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      handoff_log: {
        Row: {
          action: string
          created_at: string
          id: string
          phone: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          phone: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          phone?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      inbound_alerts: {
        Row: {
          contact_name: string | null
          id: string
          message_id: string
          phone: string
          preview: string | null
          received_at: string
        }
        Insert: {
          contact_name?: string | null
          id?: string
          message_id: string
          phone: string
          preview?: string | null
          received_at?: string
        }
        Update: {
          contact_name?: string | null
          id?: string
          message_id?: string
          phone?: string
          preview?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_alerts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      intent_responses: {
        Row: {
          active: boolean
          alternatives: string[]
          created_at: string
          examples: string
          id: string
          intent: string
          priority: number
          response: string
        }
        Insert: {
          active?: boolean
          alternatives?: string[]
          created_at?: string
          examples?: string
          id?: string
          intent: string
          priority?: number
          response?: string
        }
        Update: {
          active?: boolean
          alternatives?: string[]
          created_at?: string
          examples?: string
          id?: string
          intent?: string
          priority?: number
          response?: string
        }
        Relationships: []
      }
      interest_settings: {
        Row: {
          context_messages: number
          hot_threshold: number
          id: boolean
          trend_min_delta: number
          trend_window: number
          updated_at: string
        }
        Insert: {
          context_messages?: number
          hot_threshold?: number
          id?: boolean
          trend_min_delta?: number
          trend_window?: number
          updated_at?: string
        }
        Update: {
          context_messages?: number
          hot_threshold?: number
          id?: boolean
          trend_min_delta?: number
          trend_window?: number
          updated_at?: string
        }
        Relationships: []
      }
      lead_interest: {
        Row: {
          analyzed_at: string | null
          chat_id: string | null
          hot: boolean
          intent: string
          last_error: string | null
          last_message_id: string | null
          lead_id: string | null
          level: string
          logic_version: string
          objection: string | null
          pending_at: string | null
          phone: string
          previous_score: number | null
          reasons: Json
          score: number
          trend: string
          updated_at: string
        }
        Insert: {
          analyzed_at?: string | null
          chat_id?: string | null
          hot?: boolean
          intent?: string
          last_error?: string | null
          last_message_id?: string | null
          lead_id?: string | null
          level?: string
          logic_version?: string
          objection?: string | null
          pending_at?: string | null
          phone: string
          previous_score?: number | null
          reasons?: Json
          score?: number
          trend?: string
          updated_at?: string
        }
        Update: {
          analyzed_at?: string | null
          chat_id?: string | null
          hot?: boolean
          intent?: string
          last_error?: string | null
          last_message_id?: string | null
          lead_id?: string | null
          level?: string
          logic_version?: string
          objection?: string | null
          pending_at?: string | null
          phone?: string
          previous_score?: number | null
          reasons?: Json
          score?: number
          trend?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_interest_history: {
        Row: {
          created_at: string
          hot: boolean
          id: string
          intent: string
          level: string
          logic_version: string
          objection: string | null
          phone: string
          previous_score: number | null
          reason: string | null
          reasons: Json
          score: number
          source_message_id: string | null
          trend: string
        }
        Insert: {
          created_at?: string
          hot?: boolean
          id?: string
          intent: string
          level: string
          logic_version?: string
          objection?: string | null
          phone: string
          previous_score?: number | null
          reason?: string | null
          reasons?: Json
          score: number
          source_message_id?: string | null
          trend?: string
        }
        Update: {
          created_at?: string
          hot?: boolean
          id?: string
          intent?: string
          level?: string
          logic_version?: string
          objection?: string | null
          phone?: string
          previous_score?: number | null
          reason?: string | null
          reasons?: Json
          score?: number
          source_message_id?: string | null
          trend?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          created_at: string
          id: string
          name: string | null
          phone: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          phone: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          phone?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          chat_id: string | null
          content: string | null
          created_at: string
          direction: string
          error: string | null
          execution_id: string | null
          id: string
          idempotency_key: string | null
          phone: string
          provider_message_id: string | null
          status: string
          type: string
        }
        Insert: {
          chat_id?: string | null
          content?: string | null
          created_at?: string
          direction: string
          error?: string | null
          execution_id?: string | null
          id?: string
          idempotency_key?: string | null
          phone: string
          provider_message_id?: string | null
          status?: string
          type?: string
        }
        Update: {
          chat_id?: string | null
          content?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          execution_id?: string | null
          id?: string
          idempotency_key?: string | null
          phone?: string
          provider_message_id?: string | null
          status?: string
          type?: string
        }
        Relationships: []
      }
      send_window: {
        Row: {
          days: number[]
          end_hour: number
          id: boolean
          start_hour: number
          tz_offset_minutes: number
          updated_at: string
        }
        Insert: {
          days?: number[]
          end_hour?: number
          id?: boolean
          start_hour?: number
          tz_offset_minutes?: number
          updated_at?: string
        }
        Update: {
          days?: number[]
          end_hour?: number
          id?: boolean
          start_hour?: number
          tz_offset_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      sla_cycles: {
        Row: {
          alert_level: number
          attendant_at_start: string | null
          close_reason: string | null
          created_at: string
          deadline_s: number
          final_status: string | null
          first_auto_reply_at: string | null
          first_message_id: string
          human_reply_at: string | null
          human_reply_by: string | null
          id: string
          in_count: number
          kind: string
          last_in_at: string
          lead_id: string | null
          phone: string
          priority: boolean
          started_at: string
          status: string
          updated_at: string
          wait_s: number | null
        }
        Insert: {
          alert_level?: number
          attendant_at_start?: string | null
          close_reason?: string | null
          created_at?: string
          deadline_s: number
          final_status?: string | null
          first_auto_reply_at?: string | null
          first_message_id: string
          human_reply_at?: string | null
          human_reply_by?: string | null
          id?: string
          in_count?: number
          kind?: string
          last_in_at: string
          lead_id?: string | null
          phone: string
          priority?: boolean
          started_at: string
          status?: string
          updated_at?: string
          wait_s?: number | null
        }
        Update: {
          alert_level?: number
          attendant_at_start?: string | null
          close_reason?: string | null
          created_at?: string
          deadline_s?: number
          final_status?: string | null
          first_auto_reply_at?: string | null
          first_message_id?: string
          human_reply_at?: string | null
          human_reply_by?: string | null
          id?: string
          in_count?: number
          kind?: string
          last_in_at?: string
          lead_id?: string | null
          phone?: string
          priority?: boolean
          started_at?: string
          status?: string
          updated_at?: string
          wait_s?: number | null
        }
        Relationships: []
      }
      sla_events: {
        Row: {
          created_at: string
          cycle_id: string
          data: Json
          event: string
          id: string
          phone: string
        }
        Insert: {
          created_at?: string
          cycle_id: string
          data?: Json
          event: string
          id?: string
          phone: string
        }
        Update: {
          created_at?: string
          cycle_id?: string
          data?: Json
          event?: string
          id?: string
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_events_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "sla_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_settings: {
        Row: {
          alerts_enabled: boolean
          attendant_targets: Json
          biz_days: number[]
          biz_end_hour: number
          biz_start_hour: number
          continuous: boolean
          critical_mult: number
          first_response_s: number
          id: boolean
          ongoing_s: number
          priority_s: number
          target_pct: number
          tz_offset_minutes: number
          updated_at: string
          warn_pct: number
        }
        Insert: {
          alerts_enabled?: boolean
          attendant_targets?: Json
          biz_days?: number[]
          biz_end_hour?: number
          biz_start_hour?: number
          continuous?: boolean
          critical_mult?: number
          first_response_s?: number
          id?: boolean
          ongoing_s?: number
          priority_s?: number
          target_pct?: number
          tz_offset_minutes?: number
          updated_at?: string
          warn_pct?: number
        }
        Update: {
          alerts_enabled?: boolean
          attendant_targets?: Json
          biz_days?: number[]
          biz_end_hour?: number
          biz_start_hour?: number
          continuous?: boolean
          critical_mult?: number
          first_response_s?: number
          id?: boolean
          ongoing_s?: number
          priority_s?: number
          target_pct?: number
          tz_offset_minutes?: number
          updated_at?: string
          warn_pct?: number
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          event_type: string | null
          id: string
          payload: Json | null
          processed_at: string | null
          provider_event_id: string
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          provider_event_id: string
        }
        Update: {
          created_at?: string
          event_type?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          provider_event_id?: string
        }
        Relationships: []
      }
      whatsapp_sessions: {
        Row: {
          channel_id: string | null
          connected_number: string | null
          created_at: string
          id: string
          last_error: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          connected_number?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          connected_number?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      worker_auth: {
        Row: {
          id: boolean
          token: string
        }
        Insert: {
          id?: boolean
          token: string
        }
        Update: {
          id?: boolean
          token?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_conversation: {
        Args: { _name: string; _phone: string }
        Returns: {
          assigned_at: string
          assigned_name: string
          assigned_to: string
          ok: boolean
        }[]
      }
      release_conversation: { Args: { _phone: string }; Returns: boolean }
      sla_close: { Args: { _phone: string; _reason: string }; Returns: boolean }
      sla_elapsed: { Args: { _from: string; _to: string }; Returns: number }
      sla_tick: { Args: never; Returns: number }
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
