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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      beta_signups: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          role: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: string
        }
        Relationships: []
      }
      chart_placements_cache: {
        Row: {
          cache_key: string
          created_at: string
          data: Json
          expires_at: string
          id: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          data?: Json
          expires_at?: string
          id?: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          data?: Json
          expires_at?: string
          id?: string
        }
        Relationships: []
      }
      credit_alerts: {
        Row: {
          artist: string
          credit_role: string
          discovered_at: string
          favorite_id: string | null
          id: string
          is_read: boolean
          song_title: string
          user_id: string
        }
        Insert: {
          artist: string
          credit_role: string
          discovered_at?: string
          favorite_id?: string | null
          id?: string
          is_read?: boolean
          song_title: string
          user_id: string
        }
        Update: {
          artist?: string
          credit_role?: string
          discovered_at?: string
          favorite_id?: string | null
          id?: string
          is_read?: boolean
          song_title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_alerts_favorite_id_fkey"
            columns: ["favorite_id"]
            isOneToOne: false
            referencedRelation: "favorites"
            referencedColumns: ["id"]
          },
        ]
      }
      data_issues: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          issue_types: string[]
          module: string | null
          person_name: string | null
          song_artist: string
          song_title: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          issue_types?: string[]
          module?: string | null
          person_name?: string | null
          song_artist: string
          song_title: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          issue_types?: string[]
          module?: string | null
          person_name?: string | null
          song_artist?: string
          song_title?: string
          user_id?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          ipi: string | null
          name: string
          notes: string | null
          pro: string | null
          publisher: string | null
          role: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ipi?: string | null
          name: string
          notes?: string | null
          pro?: string | null
          publisher?: string | null
          role: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ipi?: string | null
          name?: string
          notes?: string | null
          pro?: string | null
          publisher?: string | null
          role?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      hunter_email_cache: {
        Row: {
          cache_key: string
          created_at: string
          data: Json
          expires_at: string
          id: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          data?: Json
          expires_at?: string
          id?: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          data?: Json
          expires_at?: string
          id?: string
        }
        Relationships: []
      }
      mlc_shares_cache: {
        Row: {
          cache_key: string
          created_at: string
          data: Json
          expires_at: string
          id: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          data?: Json
          expires_at?: string
          id?: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          data?: Json
          expires_at?: string
          id?: string
        }
        Relationships: []
      }
      pro_cache: {
        Row: {
          created_at: string
          data: Json
          expires_at: string
          id: string
          name: string
          name_lower: string
        }
        Insert: {
          created_at?: string
          data?: Json
          expires_at?: string
          id?: string
          name: string
          name_lower?: string
        }
        Update: {
          created_at?: string
          data?: Json
          expires_at?: string
          id?: string
          name?: string
          name_lower?: string
        }
        Relationships: []
      }
      radio_airplay_cache: {
        Row: {
          cache_key: string
          created_at: string
          data: Json
          expires_at: string
          id: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          data?: Json
          expires_at?: string
          id?: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          data?: Json
          expires_at?: string
          id?: string
        }
        Relationships: []
      }
      recommendation_interactions: {
        Row: {
          created_at: string
          genre: string | null
          id: string
          interaction_type: string
          recommendation_artist: string
          recommendation_title: string
          talent_role: string | null
          unsigned_talent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          genre?: string | null
          id?: string
          interaction_type?: string
          recommendation_artist: string
          recommendation_title: string
          talent_role?: string | null
          unsigned_talent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          genre?: string | null
          id?: string
          interaction_type?: string
          recommendation_artist?: string
          recommendation_title?: string
          talent_role?: string | null
          unsigned_talent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      streaming_stats_cache: {
        Row: {
          cache_key: string
          created_at: string
          data: Json
          expires_at: string
          id: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          data?: Json
          expires_at?: string
          id?: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          data?: Json
          expires_at?: string
          id?: string
        }
        Relationships: []
      }
      team_favorites: {
        Row: {
          added_by: string
          created_at: string
          id: string
          ipi: string | null
          name: string
          pro: string | null
          publisher: string | null
          role: string
          sort_order: number
          team_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          id?: string
          ipi?: string | null
          name: string
          pro?: string | null
          publisher?: string | null
          role: string
          sort_order?: number
          team_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          id?: string
          ipi?: string | null
          name?: string
          pro?: string | null
          publisher?: string | null
          role?: string
          sort_order?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_favorites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invites: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string
          team_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by: string
          team_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          invited_email: string | null
          joined_at: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_email?: string | null
          joined_at?: string
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          invited_email?: string | null
          joined_at?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_local_backups: {
        Row: {
          data_key: string
          data_value: Json
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          data_key: string
          data_value?: Json
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          data_key?: string
          data_value?: Json
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          admin_status_filter: string
          chart_filter: string
          created_at: string
          genre_filter: string
          id: string
          label_status_filter: string
          label_type_filter: string
          publishing_type_filter: string
          role_filter: string
          signing_status_filter: string
          updated_at: string
          user_id: string
          writers_count_filter: string
        }
        Insert: {
          admin_status_filter?: string
          chart_filter?: string
          created_at?: string
          genre_filter?: string
          id?: string
          label_status_filter?: string
          label_type_filter?: string
          publishing_type_filter?: string
          role_filter?: string
          signing_status_filter?: string
          updated_at?: string
          user_id: string
          writers_count_filter?: string
        }
        Update: {
          admin_status_filter?: string
          chart_filter?: string
          created_at?: string
          genre_filter?: string
          id?: string
          label_status_filter?: string
          label_type_filter?: string
          publishing_type_filter?: string
          role_filter?: string
          signing_status_filter?: string
          updated_at?: string
          user_id?: string
          writers_count_filter?: string
        }
        Relationships: []
      }
      watchlist_activity: {
        Row: {
          activity_type: string
          created_at: string
          details: Json
          entry_id: string
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          details?: Json
          entry_id: string
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          details?: Json
          entry_id?: string
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_activity_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "watchlist_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_activity_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_entries: {
        Row: {
          assigned_to_user_id: string | null
          contact_notes: string | null
          created_at: string
          created_by: string
          id: string
          ipi: string | null
          is_major: boolean | null
          is_priority: boolean
          person_name: string
          person_type: string
          pipeline_status: string
          pro: string | null
          social_links: Json | null
          team_id: string
          updated_at: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          contact_notes?: string | null
          created_at?: string
          created_by: string
          id?: string
          ipi?: string | null
          is_major?: boolean | null
          is_priority?: boolean
          person_name: string
          person_type?: string
          pipeline_status?: string
          pro?: string | null
          social_links?: Json | null
          team_id: string
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: string | null
          contact_notes?: string | null
          created_at?: string
          created_by?: string
          id?: string
          ipi?: string | null
          is_major?: boolean | null
          is_priority?: boolean
          person_name?: string
          person_type?: string
          pipeline_status?: string
          pro?: string | null
          social_links?: Json | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_entry_sources: {
        Row: {
          added_at: string
          artist: string
          entry_id: string
          id: string
          song_title: string
        }
        Insert: {
          added_at?: string
          artist: string
          entry_id: string
          id?: string
          song_title: string
        }
        Update: {
          added_at?: string
          artist?: string
          entry_id?: string
          id?: string
          song_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_entry_sources_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "watchlist_entries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_owner: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
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
    Enums: {},
  },
} as const
