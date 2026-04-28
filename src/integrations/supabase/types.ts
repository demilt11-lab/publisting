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
      artist_aliases: {
        Row: {
          alias_name: string
          alias_name_lower: string | null
          alias_type: string
          confidence: number | null
          created_at: string
          id: string
          person_id: string | null
          source: string | null
        }
        Insert: {
          alias_name: string
          alias_name_lower?: string | null
          alias_type?: string
          confidence?: number | null
          created_at?: string
          id?: string
          person_id?: string | null
          source?: string | null
        }
        Update: {
          alias_name?: string
          alias_name_lower?: string | null
          alias_type?: string
          confidence?: number | null
          created_at?: string
          id?: string
          person_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_aliases_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_tour_data: {
        Row: {
          artist_name: string
          avg_venue_capacity: number | null
          created_at: string
          id: string
          last_tour_date: string | null
          next_show_date: string | null
          on_tour: boolean | null
          person_id: string | null
          raw_events: Json | null
          touring_regions: string[] | null
          upcoming_shows_count: number | null
          updated_at: string
        }
        Insert: {
          artist_name: string
          avg_venue_capacity?: number | null
          created_at?: string
          id?: string
          last_tour_date?: string | null
          next_show_date?: string | null
          on_tour?: boolean | null
          person_id?: string | null
          raw_events?: Json | null
          touring_regions?: string[] | null
          upcoming_shows_count?: number | null
          updated_at?: string
        }
        Update: {
          artist_name?: string
          avg_venue_capacity?: number | null
          created_at?: string
          id?: string
          last_tour_date?: string | null
          next_show_date?: string | null
          on_tour?: boolean | null
          person_id?: string | null
          raw_events?: Json | null
          touring_regions?: string[] | null
          upcoming_shows_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_tour_data_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_trending_metrics: {
        Row: {
          breakout_probability: number | null
          created_at: string | null
          date: string
          follower_velocity: Json | null
          genre_momentum_score: number | null
          genre_shift_score: number | null
          id: string
          person_id: string | null
          playlist_velocity: number | null
          regional_growth: Json | null
          social_mentions: number | null
          stream_velocity: number | null
          tiktok_sound_uses: number | null
          total_streams: number | null
          trending_regions: string[] | null
          youtube_views: number | null
        }
        Insert: {
          breakout_probability?: number | null
          created_at?: string | null
          date: string
          follower_velocity?: Json | null
          genre_momentum_score?: number | null
          genre_shift_score?: number | null
          id?: string
          person_id?: string | null
          playlist_velocity?: number | null
          regional_growth?: Json | null
          social_mentions?: number | null
          stream_velocity?: number | null
          tiktok_sound_uses?: number | null
          total_streams?: number | null
          trending_regions?: string[] | null
          youtube_views?: number | null
        }
        Update: {
          breakout_probability?: number | null
          created_at?: string | null
          date?: string
          follower_velocity?: Json | null
          genre_momentum_score?: number | null
          genre_shift_score?: number | null
          id?: string
          person_id?: string | null
          playlist_velocity?: number | null
          regional_growth?: Json | null
          social_mentions?: number | null
          stream_velocity?: number | null
          tiktok_sound_uses?: number | null
          total_streams?: number | null
          trending_regions?: string[] | null
          youtube_views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_trending_metrics_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
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
      catalog_comparables: {
        Row: {
          annual_revenue: number | null
          buyer: string | null
          catalog_name: string
          created_at: string
          genre: string | null
          id: string
          multiple: number | null
          sale_date: string | null
          sale_price: number | null
          seller: string | null
          song_count: number | null
          source: string | null
          source_url: string | null
        }
        Insert: {
          annual_revenue?: number | null
          buyer?: string | null
          catalog_name: string
          created_at?: string
          genre?: string | null
          id?: string
          multiple?: number | null
          sale_date?: string | null
          sale_price?: number | null
          seller?: string | null
          song_count?: number | null
          source?: string | null
          source_url?: string | null
        }
        Update: {
          annual_revenue?: number | null
          buyer?: string | null
          catalog_name?: string
          created_at?: string
          genre?: string | null
          id?: string
          multiple?: number | null
          sale_date?: string | null
          sale_price?: number | null
          seller?: string | null
          song_count?: number | null
          source?: string | null
          source_url?: string | null
        }
        Relationships: []
      }
      catalog_valuations: {
        Row: {
          assumptions: Json | null
          concentration_risk: number | null
          confidence_interval: Json | null
          copyright_expiry_impact: number | null
          created_at: string | null
          decay_factor: number | null
          geographic_score: number | null
          id: string
          methodology: string
          song_valuations: Json | null
          total_value: number | null
          user_id: string
          valuation_date: string
        }
        Insert: {
          assumptions?: Json | null
          concentration_risk?: number | null
          confidence_interval?: Json | null
          copyright_expiry_impact?: number | null
          created_at?: string | null
          decay_factor?: number | null
          geographic_score?: number | null
          id?: string
          methodology?: string
          song_valuations?: Json | null
          total_value?: number | null
          user_id: string
          valuation_date?: string
        }
        Update: {
          assumptions?: Json | null
          concentration_risk?: number | null
          confidence_interval?: Json | null
          copyright_expiry_impact?: number | null
          created_at?: string | null
          decay_factor?: number | null
          geographic_score?: number | null
          id?: string
          methodology?: string
          song_valuations?: Json | null
          total_value?: number | null
          user_id?: string
          valuation_date?: string
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
      competitor_signings: {
        Row: {
          competitor_name: string
          created_at: string
          created_by: string
          deal_date: string | null
          estimated_value_range: string | null
          genre: string | null
          id: string
          news_source_url: string | null
          notes: string | null
          person_name: string
          person_type: string
          team_id: string
          watchlist_entry_id: string | null
        }
        Insert: {
          competitor_name: string
          created_at?: string
          created_by: string
          deal_date?: string | null
          estimated_value_range?: string | null
          genre?: string | null
          id?: string
          news_source_url?: string | null
          notes?: string | null
          person_name: string
          person_type?: string
          team_id: string
          watchlist_entry_id?: string | null
        }
        Update: {
          competitor_name?: string
          created_at?: string
          created_by?: string
          deal_date?: string | null
          estimated_value_range?: string | null
          genre?: string | null
          id?: string
          news_source_url?: string | null
          notes?: string | null
          person_name?: string
          person_type?: string
          team_id?: string
          watchlist_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_signings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_signings_watchlist_entry_id_fkey"
            columns: ["watchlist_entry_id"]
            isOneToOne: false
            referencedRelation: "watchlist_entries"
            referencedColumns: ["id"]
          },
        ]
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
      data_conflicts: {
        Row: {
          confidence_1: number | null
          confidence_2: number | null
          created_at: string
          field_name: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          resolved_value: string | null
          song_artist: string
          song_title: string
          source_1: string
          source_2: string
          status: string
          value_1: string
          value_2: string
        }
        Insert: {
          confidence_1?: number | null
          confidence_2?: number | null
          created_at?: string
          field_name: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_value?: string | null
          song_artist: string
          song_title: string
          source_1: string
          source_2: string
          status?: string
          value_1: string
          value_2: string
        }
        Update: {
          confidence_1?: number | null
          confidence_2?: number | null
          created_at?: string
          field_name?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_value?: string | null
          song_artist?: string
          song_title?: string
          source_1?: string
          source_2?: string
          status?: string
          value_1?: string
          value_2?: string
        }
        Relationships: []
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
      deal_likelihood_scores: {
        Row: {
          created_at: string | null
          entry_id: string
          factors: Json | null
          id: string
          next_best_action_date: string | null
          score: number | null
          suggested_action: string | null
          team_id: string
        }
        Insert: {
          created_at?: string | null
          entry_id: string
          factors?: Json | null
          id?: string
          next_best_action_date?: string | null
          score?: number | null
          suggested_action?: string | null
          team_id: string
        }
        Update: {
          created_at?: string | null
          entry_id?: string
          factors?: Json | null
          id?: string
          next_best_action_date?: string | null
          score?: number | null
          suggested_action?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_likelihood_scores_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "watchlist_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_likelihood_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_rooms: {
        Row: {
          created_at: string
          created_by: string
          documents: Json
          entry_id: string
          id: string
          notes_history: Json
          status: string
          team_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          documents?: Json
          entry_id: string
          id?: string
          notes_history?: Json
          status?: string
          team_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          documents?: Json
          entry_id?: string
          id?: string
          notes_history?: Json
          status?: string
          team_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_rooms_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "watchlist_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_rooms_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_scoring_settings: {
        Row: {
          catalog_depth_weight: number
          created_at: string
          deal_stage_weight: number
          id: string
          priority_weight: number
          social_weight: number
          streaming_weight: number
          updated_at: string
          user_id: string
        }
        Insert: {
          catalog_depth_weight?: number
          created_at?: string
          deal_stage_weight?: number
          id?: string
          priority_weight?: number
          social_weight?: number
          streaming_weight?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          catalog_depth_weight?: number
          created_at?: string
          deal_stage_weight?: number
          id?: string
          priority_weight?: number
          social_weight?: number
          streaming_weight?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      decay_curves: {
        Row: {
          created_at: string
          description: string | null
          genre: string
          id: string
          updated_at: string
          year1_weight: number
          year2_weight: number
          year3_weight: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          genre: string
          id?: string
          updated_at?: string
          year1_weight?: number
          year2_weight?: number
          year3_weight?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          genre?: string
          id?: string
          updated_at?: string
          year1_weight?: number
          year2_weight?: number
          year3_weight?: number
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
      lookalike_searches: {
        Row: {
          created_at: string
          filters_used: Json
          id: string
          results: Json
          source_artist: string
          source_features: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          filters_used?: Json
          id?: string
          results?: Json
          source_artist: string
          source_features?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          filters_used?: Json
          id?: string
          results?: Json
          source_artist?: string
          source_features?: Json
          user_id?: string
        }
        Relationships: []
      }
      market_multiples: {
        Row: {
          annual_revenue: number | null
          buyer: string | null
          catalog_size: number | null
          created_at: string | null
          genre: string | null
          id: string
          multiple: number | null
          purchase_price: number | null
          seller: string | null
          source: string | null
          transaction_date: string | null
          verified: boolean | null
        }
        Insert: {
          annual_revenue?: number | null
          buyer?: string | null
          catalog_size?: number | null
          created_at?: string | null
          genre?: string | null
          id?: string
          multiple?: number | null
          purchase_price?: number | null
          seller?: string | null
          source?: string | null
          transaction_date?: string | null
          verified?: boolean | null
        }
        Update: {
          annual_revenue?: number | null
          buyer?: string | null
          catalog_size?: number | null
          created_at?: string | null
          genre?: string | null
          id?: string
          multiple?: number | null
          purchase_price?: number | null
          seller?: string | null
          source?: string | null
          transaction_date?: string | null
          verified?: boolean | null
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
      mlc_credentials: {
        Row: {
          auto_lookup_enabled: boolean
          created_at: string
          password: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          auto_lookup_enabled?: boolean
          created_at?: string
          password: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          auto_lookup_enabled?: boolean
          created_at?: string
          password?: string
          updated_at?: string
          user_id?: string
          username?: string
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
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          metadata: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
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
          pro_affiliation: string | null
          role: string | null
          soundcloud_url: string | null
          spotify_id: string | null
          territory_coverage: Json | null
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
          pro_affiliation?: string | null
          role?: string | null
          soundcloud_url?: string | null
          spotify_id?: string | null
          territory_coverage?: Json | null
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
          pro_affiliation?: string | null
          role?: string | null
          soundcloud_url?: string | null
          spotify_id?: string | null
          territory_coverage?: Json | null
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
      pipeline_activities: {
        Row: {
          activity_type: string
          created_at: string | null
          created_by: string
          details: Json | null
          entry_id: string
          id: string
          team_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          created_by: string
          details?: Json | null
          entry_id: string
          id?: string
          team_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          created_by?: string
          details?: Json | null
          entry_id?: string
          id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_activities_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "watchlist_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_activities_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_tracking: {
        Row: {
          accuracy_percentage: number | null
          actual_date: string | null
          actual_value: Json | null
          created_at: string
          entity_name: string
          entity_type: string | null
          genre: string | null
          id: string
          notes: string | null
          predicted_date: string | null
          predicted_value: Json | null
          prediction_type: string
          region: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy_percentage?: number | null
          actual_date?: string | null
          actual_value?: Json | null
          created_at?: string
          entity_name: string
          entity_type?: string | null
          genre?: string | null
          id?: string
          notes?: string | null
          predicted_date?: string | null
          predicted_value?: Json | null
          prediction_type: string
          region?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy_percentage?: number | null
          actual_date?: string | null
          actual_value?: Json | null
          created_at?: string
          entity_name?: string
          entity_type?: string | null
          genre?: string | null
          id?: string
          notes?: string | null
          predicted_date?: string | null
          predicted_value?: Json | null
          prediction_type?: string
          region?: string | null
          updated_at?: string
          user_id?: string
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
      saved_search_presets: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_shared: boolean | null
          last_used_at: string | null
          name: string
          regions: string[] | null
          team_id: string | null
          updated_at: string
          usage_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          is_shared?: boolean | null
          last_used_at?: string | null
          name: string
          regions?: string[] | null
          team_id?: string | null
          updated_at?: string
          usage_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_shared?: boolean | null
          last_used_at?: string | null
          name?: string
          regions?: string[] | null
          team_id?: string | null
          updated_at?: string
          usage_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_search_presets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      song_matches: {
        Row: {
          catalog_song_key: string | null
          confidence: number
          created_at: string
          external_id: string
          id: string
          match_type: string
          matched_data: Json
          song_artist: string | null
          song_title: string
          source: string
          user_id: string
        }
        Insert: {
          catalog_song_key?: string | null
          confidence?: number
          created_at?: string
          external_id: string
          id?: string
          match_type: string
          matched_data?: Json
          song_artist?: string | null
          song_title: string
          source: string
          user_id: string
        }
        Update: {
          catalog_song_key?: string | null
          confidence?: number
          created_at?: string
          external_id?: string
          id?: string
          match_type?: string
          matched_data?: Json
          song_artist?: string | null
          song_title?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      soundcharts_cache: {
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
      spotify_credentials: {
        Row: {
          auto_lookup_enabled: boolean
          client_id: string
          client_secret: string
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_lookup_enabled?: boolean
          client_id: string
          client_secret: string
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_lookup_enabled?: boolean
          client_id?: string
          client_secret?: string
          created_at?: string
          updated_at?: string
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
      streaming_velocity: {
        Row: {
          annotations: Json | null
          artist: string
          created_at: string
          daily_streams: number | null
          date: string
          id: string
          platform: string | null
          region: string | null
          song_key: string
          title: string
          velocity_type: string | null
          weekly_change_pct: number | null
          weekly_streams: number | null
        }
        Insert: {
          annotations?: Json | null
          artist: string
          created_at?: string
          daily_streams?: number | null
          date?: string
          id?: string
          platform?: string | null
          region?: string | null
          song_key: string
          title: string
          velocity_type?: string | null
          weekly_change_pct?: number | null
          weekly_streams?: number | null
        }
        Update: {
          annotations?: Json | null
          artist?: string
          created_at?: string
          daily_streams?: number | null
          date?: string
          id?: string
          platform?: string | null
          region?: string | null
          song_key?: string
          title?: string
          velocity_type?: string | null
          weekly_change_pct?: number | null
          weekly_streams?: number | null
        }
        Relationships: []
      }
      team_activity_feed: {
        Row: {
          action_type: string
          actor_id: string
          created_at: string
          details: Json | null
          id: string
          mentions: string[] | null
          target_id: string | null
          target_name: string | null
          target_type: string | null
          team_id: string
        }
        Insert: {
          action_type: string
          actor_id: string
          created_at?: string
          details?: Json | null
          id?: string
          mentions?: string[] | null
          target_id?: string | null
          target_name?: string | null
          target_type?: string | null
          team_id: string
        }
        Update: {
          action_type?: string
          actor_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          mentions?: string[] | null
          target_id?: string | null
          target_name?: string | null
          target_type?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_activity_feed_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
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
      trend_predictions: {
        Row: {
          actual_date: string | null
          confidence_score: number | null
          created_at: string | null
          id: string
          person_id: string | null
          predicted_date: string | null
          predicted_value: Json | null
          prediction_type: string
          realized: boolean | null
          reasoning: string | null
        }
        Insert: {
          actual_date?: string | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          person_id?: string | null
          predicted_date?: string | null
          predicted_value?: Json | null
          prediction_type: string
          realized?: boolean | null
          reasoning?: string | null
        }
        Update: {
          actual_date?: string | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          person_id?: string | null
          predicted_date?: string | null
          predicted_value?: Json | null
          prediction_type?: string
          realized?: boolean | null
          reasoning?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trend_predictions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
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
      verified_splits: {
        Row: {
          ascap_work_id: string | null
          bmi_work_id: string | null
          created_at: string
          cross_check_results: Json
          id: string
          iswc: string | null
          last_verified: string
          notes: string | null
          publishers: Json
          song_artist: string | null
          song_title: string
          source: string
          spotify_track_id: string | null
          updated_at: string
          user_id: string
          work_id: string | null
          writers: Json
          youtube_canonical_video_id: string | null
        }
        Insert: {
          ascap_work_id?: string | null
          bmi_work_id?: string | null
          created_at?: string
          cross_check_results?: Json
          id?: string
          iswc?: string | null
          last_verified?: string
          notes?: string | null
          publishers?: Json
          song_artist?: string | null
          song_title: string
          source?: string
          spotify_track_id?: string | null
          updated_at?: string
          user_id: string
          work_id?: string | null
          writers?: Json
          youtube_canonical_video_id?: string | null
        }
        Update: {
          ascap_work_id?: string | null
          bmi_work_id?: string | null
          created_at?: string
          cross_check_results?: Json
          id?: string
          iswc?: string | null
          last_verified?: string
          notes?: string | null
          publishers?: Json
          song_artist?: string | null
          song_title?: string
          source?: string
          spotify_track_id?: string | null
          updated_at?: string
          user_id?: string
          work_id?: string | null
          writers?: Json
          youtube_canonical_video_id?: string | null
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
          lane_history: Json
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
          lane_history?: Json
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
          lane_history?: Json
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
      youtube_content_id: {
        Row: {
          cache_key: string | null
          claim_count: number | null
          created_at: string
          estimated_revenue: number | null
          expires_at: string | null
          id: string
          song_artist: string
          song_title: string
          top_videos: Json | null
          total_views: number | null
          updated_at: string
          video_count: number | null
        }
        Insert: {
          cache_key?: string | null
          claim_count?: number | null
          created_at?: string
          estimated_revenue?: number | null
          expires_at?: string | null
          id?: string
          song_artist: string
          song_title: string
          top_videos?: Json | null
          total_views?: number | null
          updated_at?: string
          video_count?: number | null
        }
        Update: {
          cache_key?: string | null
          claim_count?: number | null
          created_at?: string
          estimated_revenue?: number | null
          expires_at?: string | null
          id?: string
          song_artist?: string
          song_title?: string
          top_videos?: Json | null
          total_views?: number | null
          updated_at?: string
          video_count?: number | null
        }
        Relationships: []
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
