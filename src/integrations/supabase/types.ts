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
      daily_credit_claims: {
        Row: {
          claim_date: string
          claimed_at: string
          credits: number
          user_id: string
        }
        Insert: {
          claim_date: string
          claimed_at?: string
          credits: number
          user_id: string
        }
        Update: {
          claim_date?: string
          claimed_at?: string
          credits?: number
          user_id?: string
        }
        Relationships: []
      }
      generations: {
        Row: {
          created_at: string
          credits_used: number
          id: string
          project_id: string | null
          prompt: string
          result: Json | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_used?: number
          id?: string
          project_id?: string | null
          prompt: string
          result?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_used?: number
          id?: string
          project_id?: string | null
          prompt?: string
          result?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_anon_attempts: {
        Row: {
          last_attempt_at: string
          reason: string | null
          user_id: string
        }
        Insert: {
          last_attempt_at?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          last_attempt_at?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mcp_tokens: {
        Row: {
          attempt_count_24h: number
          created_at: string
          label: string | null
          last_attempt_at: string | null
          last_attempt_error: string | null
          last_attempt_ok: boolean | null
          last_client: string | null
          last_used_at: string | null
          last_user_agent: string | null
          token_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count_24h?: number
          created_at?: string
          label?: string | null
          last_attempt_at?: string | null
          last_attempt_error?: string | null
          last_attempt_ok?: boolean | null
          last_client?: string | null
          last_used_at?: string | null
          last_user_agent?: string | null
          token_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count_24h?: number
          created_at?: string
          label?: string | null
          last_attempt_at?: string | null
          last_attempt_error?: string | null
          last_attempt_ok?: boolean | null
          last_client?: string | null
          last_used_at?: string | null
          last_user_agent?: string | null
          token_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_access_tokens: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string | null
          last_used_at: string | null
          scope: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at?: string | null
          last_used_at?: string | null
          scope?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string | null
          last_used_at?: string | null
          scope?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_codes: {
        Row: {
          client_id: string
          code: string
          code_challenge: string | null
          code_challenge_method: string | null
          created_at: string
          expires_at: string
          redirect_uri: string
          resource: string | null
          scope: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          code: string
          code_challenge?: string | null
          code_challenge_method?: string | null
          created_at?: string
          expires_at: string
          redirect_uri: string
          resource?: string | null
          scope?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          code?: string
          code_challenge?: string | null
          code_challenge_method?: string | null
          created_at?: string
          expires_at?: string
          redirect_uri?: string
          resource?: string | null
          scope?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_requests: {
        Row: {
          amount: number
          created_at: string
          credits: number
          id: string
          pack_id: string
          paypal_note: string | null
          paypal_transaction_id: string
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          credits: number
          id?: string
          pack_id: string
          paypal_note?: string | null
          paypal_transaction_id: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          credits?: number
          id?: string
          pack_id?: string
          paypal_note?: string | null
          paypal_transaction_id?: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          credits_added: number
          id: string
          provider: string
          provider_payment_id: string | null
          raw: Json | null
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          credits_added?: number
          id?: string
          provider: string
          provider_payment_id?: string | null
          raw?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          credits_added?: number
          id?: string
          provider?: string
          provider_payment_id?: string | null
          raw?: Json | null
          status?: string
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
          source_prompt: string | null
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          key: string
          kind?: string
          last_seen_at?: string
          project_id: string
          source_prompt?: string | null
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          key?: string
          kind?: string
          last_seen_at?: string
          project_id?: string
          source_prompt?: string | null
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_ai_memories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_ai_settings: {
        Row: {
          created_at: string
          mode: string
          model: string | null
          project_id: string
          provider: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          mode?: string
          model?: string | null
          project_id: string
          provider?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          mode?: string
          model?: string | null
          project_id?: string
          provider?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: []
      }
      project_collaborators: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_collaborators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          content: string
          created_at: string
          file_type: string
          id: string
          path: string
          project_id: string
          service_location: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          file_type: string
          id?: string
          path: string
          project_id: string
          service_location: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          file_type?: string
          id?: string
          path?: string
          project_id?: string
          service_location?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_scans: {
        Row: {
          created_at: string
          id: string
          project_id: string
          report: Json
          score: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          report: Json
          score?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          report?: Json
          score?: number
          user_id?: string
        }
        Relationships: []
      }
      project_tasks: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json | null
          plan_id: string | null
          position: number
          project_id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json | null
          plan_id?: string | null
          position?: number
          project_id: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json | null
          plan_id?: string | null
          position?: number
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          ai_rules: string | null
          created_at: string
          description: string | null
          forked_from_project_id: string | null
          game_type: string
          id: string
          name: string
          roblox_last_published_at: string | null
          roblox_last_version: number | null
          roblox_place_id: string | null
          roblox_universe_id: string | null
          showcase_description: string | null
          showcase_likes_count: number
          showcase_published: boolean
          showcase_published_at: string | null
          showcase_remix_count: number
          showcase_thumbnail_url: string | null
          showcase_title: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_rules?: string | null
          created_at?: string
          description?: string | null
          forked_from_project_id?: string | null
          game_type: string
          id?: string
          name: string
          roblox_last_published_at?: string | null
          roblox_last_version?: number | null
          roblox_place_id?: string | null
          roblox_universe_id?: string | null
          showcase_description?: string | null
          showcase_likes_count?: number
          showcase_published?: boolean
          showcase_published_at?: string | null
          showcase_remix_count?: number
          showcase_thumbnail_url?: string | null
          showcase_title?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_rules?: string | null
          created_at?: string
          description?: string | null
          forked_from_project_id?: string | null
          game_type?: string
          id?: string
          name?: string
          roblox_last_published_at?: string | null
          roblox_last_version?: number | null
          roblox_place_id?: string | null
          roblox_universe_id?: string | null
          showcase_description?: string | null
          showcase_likes_count?: number
          showcase_published?: boolean
          showcase_published_at?: string | null
          showcase_remix_count?: number
          showcase_thumbnail_url?: string | null
          showcase_title?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          credits: number
          expires_at: string | null
          id: string
          max_redemptions: number | null
          redemption_count: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          credits: number
          expires_at?: string | null
          id?: string
          max_redemptions?: number | null
          redemption_count?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          credits?: number
          expires_at?: string | null
          id?: string
          max_redemptions?: number | null
          redemption_count?: number
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          credits: number
          id: string
          promo_id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          credits: number
          id?: string
          promo_id: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          credits?: number
          id?: string
          promo_id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_submissions: {
        Row: {
          created_at: string
          credits_awarded: number
          id: string
          note: string | null
          platform: string
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_awarded?: number
          id?: string
          note?: string | null
          platform: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_awarded?: number
          id?: string
          note?: string | null
          platform?: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      showcase_likes: {
        Row: {
          created_at: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: []
      }
      studio_errors: {
        Row: {
          created_at: string
          error_message: string
          file_path: string | null
          id: string
          project_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message: string
          file_path?: string | null
          id?: string
          project_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string
          file_path?: string | null
          id?: string
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_errors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      template_installs: {
        Row: {
          created_at: string
          credits_charged: number
          id: string
          project_id: string
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_charged?: number
          id?: string
          project_id: string
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_charged?: number
          id?: string
          project_id?: string
          template_id?: string
          user_id?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          active: boolean
          build_spec: Json
          category: string
          created_at: string
          credits_cost: number
          description: string
          difficulty: string
          features: Json
          id: string
          install_count: number
          name: string
          slug: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          build_spec: Json
          category: string
          created_at?: string
          credits_cost?: number
          description: string
          difficulty?: string
          features?: Json
          id?: string
          install_count?: number
          name: string
          slug: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          build_spec?: Json
          category?: string
          created_at?: string
          credits_cost?: number
          description?: string
          difficulty?: string
          features?: Json
          id?: string
          install_count?: number
          name?: string
          slug?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_mcp_servers: {
        Row: {
          auth_header: string | null
          created_at: string
          enabled: boolean
          id: string
          last_test_error: string | null
          last_test_ok: boolean | null
          last_tested_at: string | null
          name: string
          tool_count: number | null
          tools_cache: Json | null
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          auth_header?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          last_test_error?: string | null
          last_test_ok?: boolean | null
          last_tested_at?: string | null
          name: string
          tool_count?: number | null
          tools_cache?: Json | null
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          auth_header?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          last_test_error?: string | null
          last_test_ok?: boolean | null
          last_tested_at?: string | null
          name?: string
          tool_count?: number | null
          tools_cache?: Json | null
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      user_provider_keys: {
        Row: {
          api_key: string
          created_at: string
          label: string | null
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          label?: string | null
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          label?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust_credits: {
        Args: { _amount: number; _reason: string; _user_id: string }
        Returns: number
      }
      admin_approve_payment: {
        Args: { _request_id: string }
        Returns: undefined
      }
      admin_approve_promotion: {
        Args: { _credits: number; _submission_id: string }
        Returns: undefined
      }
      admin_reject_payment: {
        Args: { _reason: string; _request_id: string }
        Returns: undefined
      }
      admin_reject_promotion: {
        Args: { _reason: string; _submission_id: string }
        Returns: undefined
      }
      admin_set_ban: {
        Args: { _banned: boolean; _reason: string; _user_id: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      apply_referral: { Args: { _code: string }; Returns: Json }
      can_access_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      check_and_record_ai_usage: { Args: never; Returns: Json }
      claim_daily_credits: { Args: never; Returns: Json }
      claim_discord_credits: { Args: never; Returns: Json }
      get_ai_usage: { Args: never; Returns: Json }
      grant_credits_service: {
        Args: { _amount: number; _reason: string; _user_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_project_owner: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      redeem_promo_code: { Args: { _code: string }; Returns: number }
      refund_credits: {
        Args: { _amount: number; _reason?: string }
        Returns: number
      }
      remix_showcase_project: {
        Args: { _new_name: string; _source_id: string }
        Returns: string
      }
      spend_credits_atomic: { Args: { _amount: number }; Returns: number }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["owner", "admin", "user"],
    },
  },
} as const
