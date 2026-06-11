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
      business_analysis: {
        Row: {
          analysis_json: Json | null
          business_id: string
          business_type: string | null
          closing_probability: number | null
          commercial_priority: string | null
          confidence_score: number | null
          created_at: string
          detected_channels: Json | null
          detected_services: Json | null
          estimated_economic_impact: string | null
          id: string
          key_opportunities: Json | null
          key_pain_points: Json | null
          outreach_angle: string | null
          recommendation_justification: string | null
          recommended_primary_demo: string | null
          recommended_secondary_demos: Json | null
          sales_approach: string | null
          scoring_breakdown: Json | null
          sub_type: string | null
          suggested_offer: string | null
          summary_for_sales: string | null
        }
        Insert: {
          analysis_json?: Json | null
          business_id: string
          business_type?: string | null
          closing_probability?: number | null
          commercial_priority?: string | null
          confidence_score?: number | null
          created_at?: string
          detected_channels?: Json | null
          detected_services?: Json | null
          estimated_economic_impact?: string | null
          id?: string
          key_opportunities?: Json | null
          key_pain_points?: Json | null
          outreach_angle?: string | null
          recommendation_justification?: string | null
          recommended_primary_demo?: string | null
          recommended_secondary_demos?: Json | null
          sales_approach?: string | null
          scoring_breakdown?: Json | null
          sub_type?: string | null
          suggested_offer?: string | null
          summary_for_sales?: string | null
        }
        Update: {
          analysis_json?: Json | null
          business_id?: string
          business_type?: string | null
          closing_probability?: number | null
          commercial_priority?: string | null
          confidence_score?: number | null
          created_at?: string
          detected_channels?: Json | null
          detected_services?: Json | null
          estimated_economic_impact?: string | null
          id?: string
          key_opportunities?: Json | null
          key_pain_points?: Json | null
          outreach_angle?: string | null
          recommendation_justification?: string | null
          recommended_primary_demo?: string | null
          recommended_secondary_demos?: Json | null
          sales_approach?: string | null
          scoring_breakdown?: Json | null
          sub_type?: string | null
          suggested_offer?: string | null
          summary_for_sales?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_analysis_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_scrapes: {
        Row: {
          business_id: string
          created_at: string
          extracted_channels: Json | null
          extracted_hours: Json | null
          extracted_prices: Json | null
          extracted_products: Json | null
          extracted_services: Json | null
          extracted_socials: Json | null
          extraction_status: string | null
          id: string
          raw_content: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          extracted_channels?: Json | null
          extracted_hours?: Json | null
          extracted_prices?: Json | null
          extracted_products?: Json | null
          extracted_services?: Json | null
          extracted_socials?: Json | null
          extraction_status?: string | null
          id?: string
          raw_content?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          extracted_channels?: Json | null
          extracted_hours?: Json | null
          extracted_prices?: Json | null
          extracted_products?: Json | null
          extracted_services?: Json | null
          extracted_socials?: Json | null
          extraction_status?: string | null
          id?: string
          raw_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_scrapes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          city: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          sector: string | null
          source_type: string | null
          status: Database["public"]["Enums"]["lead_status"]
          sub_sector: string | null
          updated_at: string
          url: string
          url_normalized: string | null
          whatsapp: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          sector?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          sub_sector?: string | null
          updated_at?: string
          url: string
          url_normalized?: string | null
          whatsapp?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          sector?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          sub_sector?: string | null
          updated_at?: string
          url?: string
          url_normalized?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      demo_generations: {
        Row: {
          business_id: string
          created_at: string
          demo_payload: Json | null
          demo_summary: string | null
          demo_title: string
          demo_type: string
          favorite: boolean | null
          id: string
          preview_status: string | null
          preview_url: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          demo_payload?: Json | null
          demo_summary?: string | null
          demo_title: string
          demo_type: string
          favorite?: boolean | null
          id?: string
          preview_status?: string | null
          preview_url?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          demo_payload?: Json | null
          demo_summary?: string | null
          demo_title?: string
          demo_type?: string
          favorite?: boolean | null
          id?: string
          preview_status?: string | null
          preview_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_generations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activity: {
        Row: {
          activity_note: string | null
          activity_type: string
          business_id: string
          created_at: string
          id: string
          metadata_json: Json | null
        }
        Insert: {
          activity_note?: string | null
          activity_type: string
          business_id: string
          created_at?: string
          id?: string
          metadata_json?: Json | null
        }
        Update: {
          activity_note?: string | null
          activity_type?: string
          business_id?: string
          created_at?: string
          id?: string
          metadata_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activity_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_emails: {
        Row: {
          body: string
          business_id: string
          created_at: string
          edited_before_send: boolean | null
          id: string
          preheader: string | null
          recipient_email: string
          send_mode: string | null
          send_status: string | null
          sent_at: string | null
          subject: string
        }
        Insert: {
          body: string
          business_id: string
          created_at?: string
          edited_before_send?: boolean | null
          id?: string
          preheader?: string | null
          recipient_email: string
          send_mode?: string | null
          send_status?: string | null
          sent_at?: string | null
          subject: string
        }
        Update: {
          body?: string
          business_id?: string
          created_at?: string
          edited_before_send?: boolean | null
          id?: string
          preheader?: string | null
          recipient_email?: string
          send_mode?: string | null
          send_status?: string | null
          sent_at?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_emails_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      lead_stats: {
        Row: {
          total_active: number | null
          total_analyzed: number | null
          total_demo: number | null
          total_email: number | null
          total_hot: number | null
          total_lost: number | null
          total_new: number | null
          total_won: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      normalize_url: { Args: { raw_url: string }; Returns: string }
    }
    Enums: {
      lead_status:
        | "nuevo"
        | "analizado"
        | "demo_generada"
        | "email_preparado"
        | "email_enviado"
        | "interesado"
        | "reunion_agendada"
        | "cerrado"
        | "descartado"
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
      lead_status: [
        "nuevo",
        "analizado",
        "demo_generada",
        "email_preparado",
        "email_enviado",
        "interesado",
        "reunion_agendada",
        "cerrado",
        "descartado",
      ],
    },
  },
} as const
