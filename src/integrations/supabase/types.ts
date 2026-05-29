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
      agent_conversations: {
        Row: {
          created_at: string
          id: string
          project_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          actions: Json | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          actions?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          actions?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_events: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_kind: string | null
          feature: string
          id: string
          model: string
          ok: boolean
          project_id: string | null
          provider: string
          source: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_kind?: string | null
          feature: string
          id?: string
          model: string
          ok: boolean
          project_id?: string | null
          provider: string
          source?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_kind?: string | null
          feature?: string
          id?: string
          model?: string
          ok?: boolean
          project_id?: string | null
          provider?: string
          source?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_usage_events: {
        Row: {
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          user_id?: string
        }
        Relationships: []
      }
      blocked_email_domains: {
        Row: {
          created_at: string
          domain: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          reason?: string | null
        }
        Relationships: []
      }
      build_plans: {
        Row: {
          created_at: string
          id: string
          plan: Json
          project_id: string
          prompt: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan: Json
          project_id: string
          prompt: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plan?: Json
          project_id?: string
          prompt?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          balance: number
          created_at: string
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          amount: number
          balance: number
          created_at?: string
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          balance?: number
          created_at?: string
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      generations: {
        Row: {
          created_at: string
          credits_used: number
          id: string
          model: string | null
          output: Json | null
          prompt: string
          status: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_used?: number
          id?: string
          model?: string | null
          output?: Json | null
          prompt: string
          status?: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_used?: number
          id?: string
          model?: string | null
          output?: Json | null
          prompt?: string
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      image_generations: {
        Row: {
          aspect_ratio: string | null
          created_at: string
          credits_used: number
          download_url: string | null
          id: string
          image_url: string | null
          model: string | null
          negative_prompt: string | null
          prompt: string
          provider: string | null
          seed: number | null
          status: string
          style: string | null
          user_id: string
        }
        Insert: {
          aspect_ratio?: string | null
          created_at?: string
          credits_used?: number
          download_url?: string | null
          id?: string
          image_url?: string | null
          model?: string | null
          negative_prompt?: string | null
          prompt: string
          provider?: string | null
          seed?: number | null
          status?: string
          style?: string | null
          user_id: string
        }
        Update: {
          aspect_ratio?: string | null
          created_at?: string
          credits_used?: number
          download_url?: string | null
          id?: string
          image_url?: string | null
          model?: string | null
          negative_prompt?: string | null
          prompt?: string
          provider?: string | null
          seed?: number | null
          status?: string
          style?: string | null
          user_id?: string
        }
        Relationships: []
      }
      plugin_actions: {
        Row: {
          action_type: string
          created_at: string
          delivered_at: string | null
          error_message: string | null
          executed_at: string | null
          id: string
          payload: Json | null
          project_id: string
          status: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          payload?: Json | null
          project_id: string
          status?: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          payload?: Json | null
          project_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plugin_actions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      plugin_connections: {
        Row: {
          created_at: string
          id: string
          last_connected_at: string | null
          status: string
          studio_metadata: Json | null
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_connected_at?: string | null
          status?: string
          studio_metadata?: Json | null
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_connected_at?: string | null
          status?: string
          studio_metadata?: Json | null
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      plugin_context: {
        Row: {
          context: Json
          created_at: string
          id: string
          instance_count: number
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context: Json
          created_at?: string
          id?: string
          instance_count?: number
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          instance_count?: number
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plugin_context_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      plugin_tokens: {
        Row: {
          created_at: string
          token_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          token_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          token_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          ban_reason: string | null
          banned: boolean
          banned_at: string | null
          banner_url: string | null
          bio: string | null
          created_at: string
          credits: number
          discord_claimed: boolean
          display_name: string | null
          email: string
          id: string
          manual_sync_only: boolean
          referral_code: string | null
          referred_by: string | null
          specialization: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned?: boolean
          banned_at?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          credits?: number
          discord_claimed?: boolean
          display_name?: string | null
          email: string
          id: string
          manual_sync_only?: boolean
          referral_code?: string | null
          referred_by?: string | null
          specialization?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned?: boolean
          banned_at?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          credits?: number
          discord_claimed?: boolean
          display_name?: string | null
          email?: string
          id?: string
          manual_sync_only?: boolean
          referral_code?: string | null
          referred_by?: string | null
          specialization?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_ai_memories: {
        Row: {
          confidence: number
          created_at: string
          id: string
          key: string
          kind: string
          last_seen_at: string
          project_id: string
          summary: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          key: string
          kind: string
          last_seen_at?: string
          project_id: string
          summary: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          key?: string
          kind?: string
          last_seen_at?: string
          project_id?: string
          summary?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "owner" | "admin" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName]
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions]
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName]["Insert"]
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions]["Insert"]
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName]["Update"]
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions]["Update"]
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "user"],
    },
  },
} as const
