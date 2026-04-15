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
      catalog_analyses: {
        Row: {
          catalog_json: Json
          config: Json
          config_json: Json
          created_at: string
          id: string
          name: string
          notes: string | null
          results: Json
          results_json: Json | null
          song_count: number
          total_available_to_collect: number
          total_publishing_estimated: number
          total_three_year_collectible: number
          updated_at: string
          user_id: string
        }
        Insert: {
          catalog_json?: Json
          config?: Json
          config_json?: Json
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          results?: Json
          results_json?: Json | null
          song_count?: number
          total_available_to_collect?: number
          total_publishing_estimated?: number
          total_three_year_collectible?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          catalog_json?: Json
          config?: Json
          config_json?: Json
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          results?: Json
          results_json?: Json | null
          song_count?: number
          total_available_to_collect?: number
          total_publishing_estimated?: number
          total_three_year_collectible?: number
          updated_at?: string
          user_id?: string
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
      ml_feedback: {
        Row: {
          artist: string
          created_at: string
          feedback_type: string
          genre: string | null
          id: string
          recommendation_id: string | null
          song_key: string
          talent_role: string | null
          title: string
          unsigned_talent: string | null
          user_id: string
        }
        Insert: {
          artist: string
          created_at?: string
          feedback_type: string
          genre?: string | null
          id?: string
          recommendation_id?: string | null
          song_key: string
          talent_role?: string | null
          title: string
          unsigned_talent?: string | null
          user_id: string
        }
        Update: {
          artist?: string
          created_at?: string
          feedback_type?: string
          genre?: string | null
          id?: string
          recommendation_id?: string | null
          song_key?: string
          talent_role?: string | null
          title?: string
          unsigned_talent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_feedback_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "ml_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_recommendations: {
        Row: {
          artist: string
          collaborative_score: number | null
          content_score: number | null
          diversity_score: number | null
          expires_at: string
          feedback: string | null
          generated_at: string
          id: string
          reason: Json | null
          score: number
          shown_at: string | null
          song_candidate_id: string | null
          title: string
          unsigned_score: number | null
          unsigned_talent: Json | null
          user_id: string
          watchlist_score: number | null
        }
        Insert: {
          artist: string
          collaborative_score?: number | null
          content_score?: number | null
          diversity_score?: number | null
          expires_at?: string
          feedback?: string | null
          generated_at?: string
          id?: string
          reason?: Json | null
          score?: number
          shown_at?: string | null
          song_candidate_id?: string | null
          title: string
          unsigned_score?: number | null
          unsigned_talent?: Json | null
          user_id: string
          watchlist_score?: number | null
        }
        Update: {
          artist?: string
          collaborative_score?: number | null
          content_score?: number | null
          diversity_score?: number | null
          expires_at?: string
          feedback?: string | null
          generated_at?: string
          id?: string
          reason?: Json | null
          score?: number
          shown_at?: string | null
          song_candidate_id?: string | null
          title?: string
          unsigned_score?: number | null
          unsigned_talent?: Json | null
          user_id?: string
          watchlist_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ml_recommendations_song_candidate_id_fkey"
            columns: ["song_candidate_id"]
            isOneToOne: false
            referencedRelation: "ml_song_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_song_candidates: {
        Row: {
          acousticness: number | null
          apple_url: string | null
          artist: string
          created_at: string
          danceability: number | null
          energy: number | null
          enriched_at: string | null
          genre: string[] | null
          id: string
          instrumentalness: number | null
          popularity: number | null
          region: string | null
          song_key: string
          spotify_url: string | null
          tempo: number | null
          title: string
          unsigned_count: number | null
          unsigned_talent: Json | null
          valence: number | null
        }
        Insert: {
          acousticness?: number | null
          apple_url?: string | null
          artist: string
          created_at?: string
          danceability?: number | null
          energy?: number | null
          enriched_at?: string | null
          genre?: string[] | null
          id?: string
          instrumentalness?: number | null
          popularity?: number | null
          region?: string | null
          song_key: string
          spotify_url?: string | null
          tempo?: number | null
          title: string
          unsigned_count?: number | null
          unsigned_talent?: Json | null
          valence?: number | null
        }
        Update: {
          acousticness?: number | null
          apple_url?: string | null
          artist?: string
          created_at?: string
          danceability?: number | null
          energy?: number | null
          enriched_at?: string | null
          genre?: string[] | null
          id?: string
          instrumentalness?: number | null
          popularity?: number | null
          region?: string | null
          song_key?: string
          spotify_url?: string | null
          tempo?: number | null
          title?: string
          unsigned_count?: number | null
          unsigned_talent?: Json | null
          valence?: number | null
        }
        Relationships: []
      }
      ml_user_profiles: {
        Row: {
          audio_preferences: Json
          created_at: string
          feature_vector: Json | null
          genre_weights: Json
          id: string
          popularity_max: number | null
          popularity_min: number | null
          region_weights: Json
          total_searches: number | null
          total_watchlist_adds: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_preferences?: Json
          created_at?: string
          feature_vector?: Json | null
          genre_weights?: Json
          id?: string
          popularity_max?: number | null
          popularity_min?: number | null
          region_weights?: Json
          total_searches?: number | null
          total_watchlist_adds?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_preferences?: Json
          created_at?: string
          feature_vector?: Json | null
          genre_weights?: Json
          id?: string
          popularity_max?: number | null
          popularity_min?: number | null
          region_weights?: Json
          total_searches?: number | null
          total_watchlist_adds?: number | null
          updated_at?: string
          user_id?: string
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
      people: {
        Row: {
          amazon_music_id: string | null
          apple_music_id: string | null
          created_at: string | null
          deezer_id: string | null
          enrichment_version: number | null
          facebook_url: string | null
          id: string
          instagram_url: string | null
          last_enriched_at: string | null
          mbid: string | null
          name: string
          name_lower: string
          role: string | null
          soundcloud_url: string | null
          spotify_id: string | null
          tidal_id: string | null
          tiktok_url: string | null
          twitter_url: string | null
          updated_at: string | null
          website_url: string | null
          youtube_channel_id: string | null
        }
        Insert: {
          amazon_music_id?: string | null
          apple_music_id?: string | null
          created_at?: string | null
          deezer_id?: string | null
          enrichment_version?: number | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          last_enriched_at?: string | null
          mbid?: string | null
          name: string
          name_lower?: string
          role?: string | null
          soundcloud_url?: string | null
          spotify_id?: string | null
          tidal_id?: string | null
          tiktok_url?: string | null
          twitter_url?: string | null
          updated_at?: string | null
          website_url?: string | null
          youtube_channel_id?: string | null
        }
        Update: {
          amazon_music_id?: string | null
          apple_music_id?: string | null
          created_at?: string | null
          deezer_id?: string | null
          enrichment_version?: number | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          last_enriched_at?: string | null
          mbid?: string | null
          name?: string
          name_lower?: string
          role?: string | null
          soundcloud_url?: string | null
          spotify_id?: string | null
          tidal_id?: string | null
          tiktok_url?: string | null
          twitter_url?: string | null
          updated_at?: string | null
          website_url?: string | null
          youtube_channel_id?: string | null
        }
        Relationships: []
      }
      people_links: {
        Row: {
          confidence: number | null
          created_at: string | null
          id: string
          person_id: string
          platform: string
          source: string
          url: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          person_id: string
          platform: string
          source: string
          url: string
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          person_id?: string
          platform?: string
          source?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_links_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
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
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          last_sign_in_at: string | null
          provider: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          last_sign_in_at?: string | null
          provider?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_sign_in_at?: string | null
          provider?: string | null
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
      streaming_rate_audit: {
        Row: {
          action: string
          change_source: string | null
          changed_by: string | null
          created_at: string
          id: string
          new_rate: number | null
          notes: string | null
          old_rate: number | null
          streaming_rate_id: string | null
        }
        Insert: {
          action: string
          change_source?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          new_rate?: number | null
          notes?: string | null
          old_rate?: number | null
          streaming_rate_id?: string | null
        }
        Update: {
          action?: string
          change_source?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          new_rate?: number | null
          notes?: string | null
          old_rate?: number | null
          streaming_rate_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "streaming_rate_audit_streaming_rate_id_fkey"
            columns: ["streaming_rate_id"]
            isOneToOne: false
            referencedRelation: "streaming_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      streaming_rates: {
        Row: {
          country_code: string
          created_at: string
          currency: string | null
          effective_from: string
          effective_to: string | null
          id: string
          last_verified_at: string | null
          notes: string | null
          platform: string
          quarter: string
          rate_per_stream: number
          region: string | null
          source: string | null
          verified: boolean | null
        }
        Insert: {
          country_code: string
          created_at?: string
          currency?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          last_verified_at?: string | null
          notes?: string | null
          platform: string
          quarter: string
          rate_per_stream: number
          region?: string | null
          source?: string | null
          verified?: boolean | null
        }
        Update: {
          country_code?: string
          created_at?: string
          currency?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          last_verified_at?: string | null
          notes?: string | null
          platform?: string
          quarter?: string
          rate_per_stream?: number
          region?: string | null
          source?: string | null
          verified?: boolean | null
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
