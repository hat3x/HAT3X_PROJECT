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
      appointment_services: {
        Row: {
          appointment_id: string
          duration_minutes_snapshot: number | null
          final_points: number | null
          final_price: number | null
          id: string
          is_completed: boolean
          points_snapshot: number | null
          price_type_snapshot: string | null
          quantity: number
          service_id: string
          service_name_snapshot: string | null
          unit_price_snapshot: number | null
        }
        Insert: {
          appointment_id: string
          duration_minutes_snapshot?: number | null
          final_points?: number | null
          final_price?: number | null
          id?: string
          is_completed?: boolean
          points_snapshot?: number | null
          price_type_snapshot?: string | null
          quantity?: number
          service_id: string
          service_name_snapshot?: string | null
          unit_price_snapshot?: number | null
        }
        Update: {
          appointment_id?: string
          duration_minutes_snapshot?: number | null
          final_points?: number | null
          final_price?: number | null
          id?: string
          is_completed?: boolean
          points_snapshot?: number | null
          price_type_snapshot?: string | null
          quantity?: number
          service_id?: string
          service_name_snapshot?: string | null
          unit_price_snapshot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_services_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          created_at: string
          customer_id: string
          customer_notes: string | null
          end_at: string
          estimated_pending_points: number | null
          estimated_total_duration: number | null
          estimated_total_price: number | null
          final_total_points: number | null
          final_total_price: number | null
          id: string
          location_id: string
          points_awarded: boolean
          reschedule_count: number
          staff_member_id: string | null
          staff_notes: string | null
          start_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
          verified_at: string | null
          verified_by_staff_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          customer_notes?: string | null
          end_at: string
          estimated_pending_points?: number | null
          estimated_total_duration?: number | null
          estimated_total_price?: number | null
          final_total_points?: number | null
          final_total_price?: number | null
          id?: string
          location_id: string
          points_awarded?: boolean
          reschedule_count?: number
          staff_member_id?: string | null
          staff_notes?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by_staff_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          customer_notes?: string | null
          end_at?: string
          estimated_pending_points?: number | null
          estimated_total_duration?: number | null
          estimated_total_price?: number | null
          final_total_points?: number | null
          final_total_price?: number | null
          id?: string
          location_id?: string
          points_awarded?: boolean
          reschedule_count?: number
          staff_member_id?: string | null
          staff_notes?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by_staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["audit_actor_role"]
          created_at: string
          entity: string
          entity_id: string
          id: string
          location_id: string | null
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role: Database["public"]["Enums"]["audit_actor_role"]
          created_at?: string
          entity: string
          entity_id: string
          id?: string
          location_id?: string | null
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["audit_actor_role"]
          created_at?: string
          entity?: string
          entity_id?: string
          id?: string
          location_id?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_deliveries: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string
          id: string
          last_error: string | null
          provider_message_id: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id: string
          id?: string
          last_error?: string | null
          provider_message_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          last_error?: string | null
          provider_message_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_deliveries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_deliveries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          channel: Database["public"]["Enums"]["campaign_channel"]
          created_at: string
          created_by: string
          cta_url: string
          id: string
          name: string
          offer_text: string | null
          scheduled_at: string | null
          segment_json: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          template_name: string | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["campaign_channel"]
          created_at?: string
          created_by: string
          cta_url: string
          id?: string
          name: string
          offer_text?: string | null
          scheduled_at?: string | null
          segment_json?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          template_name?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["campaign_channel"]
          created_at?: string
          created_by?: string
          cta_url?: string
          id?: string
          name?: string
          offer_text?: string | null
          scheduled_at?: string | null
          segment_json?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          template_name?: string | null
        }
        Relationships: []
      }
      club_benefit_usages: {
        Row: {
          benefit_key: string
          id: string
          location_id: string
          metadata: Json | null
          staff_actor_id: string
          subscription_id: string
          used_at: string
        }
        Insert: {
          benefit_key: string
          id?: string
          location_id: string
          metadata?: Json | null
          staff_actor_id: string
          subscription_id: string
          used_at?: string
        }
        Update: {
          benefit_key?: string
          id?: string
          location_id?: string
          metadata?: Json | null
          staff_actor_id?: string
          subscription_id?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_benefit_usages_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_benefit_usages_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          consent_marketing_at: string | null
          consent_terms_at: string
          consent_whatsapp_at: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          email: string
          email_verified_at: string | null
          first_name: string
          id: string
          last_name: string
          phone: string
          phone_verified_at: string | null
          preferred_location_id: string | null
          qr_token: string
          status: Database["public"]["Enums"]["customer_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          consent_marketing_at?: string | null
          consent_terms_at?: string
          consent_whatsapp_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          email: string
          email_verified_at?: string | null
          first_name: string
          id?: string
          last_name: string
          phone: string
          phone_verified_at?: string | null
          preferred_location_id?: string | null
          qr_token?: string
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          consent_marketing_at?: string | null
          consent_terms_at?: string
          consent_whatsapp_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string
          email_verified_at?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string
          phone_verified_at?: string | null
          preferred_location_id?: string | null
          qr_token?: string
          status?: Database["public"]["Enums"]["customer_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_preferred_location_id_fkey"
            columns: ["preferred_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      device_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          customer_id: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          customer_id: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          customer_id?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_push_subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          end_time: string | null
          entry_type: string
          id: string
          notes: string | null
          staff_member_id: string
          start_time: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          end_time?: string | null
          entry_type: string
          id?: string
          notes?: string | null
          staff_member_id: string
          start_time?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          end_time?: string | null
          entry_type?: string
          id?: string
          notes?: string | null
          staff_member_id?: string
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_schedules_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string
          created_at: string
          hours_json: Json
          id: string
          name: string
          updated_at: string
          whatsapp_contact: string | null
        }
        Insert: {
          address: string
          created_at?: string
          hours_json?: Json
          id?: string
          name: string
          updated_at?: string
          whatsapp_contact?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          hours_json?: Json
          id?: string
          name?: string
          updated_at?: string
          whatsapp_contact?: string | null
        }
        Relationships: []
      }
      loyalty_accounts: {
        Row: {
          created_at: string
          customer_id: string
          last_activity_at: string | null
          last_visit_at: string | null
          points_balance: number
          visits_total: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          last_activity_at?: string | null
          last_visit_at?: string | null
          points_balance?: number
          visits_total?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          last_activity_at?: string | null
          last_visit_at?: string | null
          points_balance?: number
          visits_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          appointment_id: string | null
          created_at: string
          created_by_user_id: string | null
          customer_id: string
          description: string | null
          id: string
          points: number
          type: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          customer_id: string
          description?: string | null
          id?: string
          points: number
          type: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          customer_id?: string
          description?: string | null
          id?: string
          points?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      points_movements: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          points: number
          reason: string
          ref_id: string | null
          ref_type: string | null
          type: Database["public"]["Enums"]["points_movement_type"]
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          points: number
          reason: string
          ref_id?: string | null
          ref_type?: string | null
          type: Database["public"]["Enums"]["points_movement_type"]
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          points?: number
          reason?: string
          ref_id?: string | null
          ref_type?: string | null
          type?: Database["public"]["Enums"]["points_movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "points_movements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_scan_logs: {
        Row: {
          appointment_id: string | null
          customer_id: string
          id: string
          result: string
          scanned_at: string
          scanned_by_staff_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          customer_id: string
          id?: string
          result: string
          scanned_at?: string
          scanned_by_staff_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          customer_id?: string
          id?: string
          result?: string
          scanned_at?: string
          scanned_by_staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_scan_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_scan_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          code: string
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          redeemed_at: string | null
          redeemed_at_location_id: string | null
          status: Database["public"]["Enums"]["reward_status"]
          type: Database["public"]["Enums"]["reward_type"]
        }
        Insert: {
          code: string
          created_at?: string
          customer_id: string
          expires_at: string
          id?: string
          redeemed_at?: string | null
          redeemed_at_location_id?: string | null
          status?: Database["public"]["Enums"]["reward_status"]
          type: Database["public"]["Enums"]["reward_type"]
        }
        Update: {
          code?: string
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          redeemed_at?: string | null
          redeemed_at_location_id?: string | null
          status?: Database["public"]["Enums"]["reward_status"]
          type?: Database["public"]["Enums"]["reward_type"]
        }
        Relationships: [
          {
            foreignKeyName: "rewards_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_redeemed_at_location_id_fkey"
            columns: ["redeemed_at_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          application_min: number | null
          base_price: number | null
          category: string | null
          category_id: string | null
          created_at: string
          description: string | null
          duration_min: number | null
          excluded_from_discount: boolean
          exposure_min: number | null
          fixed_points: number | null
          id: string
          location_id: string | null
          name: string
          post_exposure_min: number | null
          price_type: string
          section: Database["public"]["Enums"]["salon_section"] | null
        }
        Insert: {
          active?: boolean
          application_min?: number | null
          base_price?: number | null
          category?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_min?: number | null
          excluded_from_discount?: boolean
          exposure_min?: number | null
          fixed_points?: number | null
          id?: string
          location_id?: string | null
          name: string
          post_exposure_min?: number | null
          price_type?: string
          section?: Database["public"]["Enums"]["salon_section"] | null
        }
        Update: {
          active?: boolean
          application_min?: number | null
          base_price?: number | null
          category?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_min?: number | null
          excluded_from_discount?: boolean
          exposure_min?: number | null
          fixed_points?: number | null
          id?: string
          location_id?: string | null
          name?: string
          post_exposure_min?: number | null
          price_type?: string
          section?: Database["public"]["Enums"]["salon_section"] | null
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      slot_holds: {
        Row: {
          created_at: string
          customer_id: string
          end_at: string
          expires_at: string
          id: string
          location_id: string
          start_at: string
          token: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          end_at: string
          expires_at: string
          id?: string
          location_id: string
          start_at: string
          token: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          end_at?: string
          expires_at?: string
          id?: string
          location_id?: string
          start_at?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "slot_holds_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_holds_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_calendar_mappings: {
        Row: {
          created_at: string
          google_calendar_id: string
          id: string
          staff_member_id: string
        }
        Insert: {
          created_at?: string
          google_calendar_id: string
          id?: string
          staff_member_id: string
        }
        Update: {
          created_at?: string
          google_calendar_id?: string
          id?: string
          staff_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_calendar_mappings_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: true
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          id: string
          location_id: string
          name: string
          section: Database["public"]["Enums"]["salon_section"]
          user_id: string | null
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          id?: string
          location_id: string
          name: string
          section: Database["public"]["Enums"]["salon_section"]
          user_id?: string | null
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          id?: string
          location_id?: string
          name?: string
          section?: Database["public"]["Enums"]["salon_section"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          currency: string
          current_period_end: string | null
          current_period_start: string | null
          customer_id: string
          id: string
          next_renewal_at: string | null
          plan: Database["public"]["Enums"]["subscription_plan"]
          price_cents: number
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_id: string
          id?: string
          next_renewal_at?: string | null
          plan: Database["public"]["Enums"]["subscription_plan"]
          price_cents: number
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_id?: string
          id?: string
          next_renewal_at?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          price_cents?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visit_pins: {
        Row: {
          created_at: string
          created_by_staff_id: string | null
          customer_id: string
          expires_at: string
          id: string
          pin: string
          status: string
          used: boolean
        }
        Insert: {
          created_at?: string
          created_by_staff_id?: string | null
          customer_id: string
          expires_at?: string
          id?: string
          pin: string
          status?: string
          used?: boolean
        }
        Update: {
          created_at?: string
          created_by_staff_id?: string | null
          customer_id?: string
          expires_at?: string
          id?: string
          pin?: string
          status?: string
          used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "visit_pins_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      welcome_coupons: {
        Row: {
          audit_redemption_id: string | null
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          percent_off: number
          status: Database["public"]["Enums"]["coupon_status"]
          used_at: string | null
        }
        Insert: {
          audit_redemption_id?: string | null
          created_at?: string
          customer_id: string
          expires_at: string
          id?: string
          percent_off?: number
          status?: Database["public"]["Enums"]["coupon_status"]
          used_at?: string | null
        }
        Update: {
          audit_redemption_id?: string | null
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          percent_off?: number
          status?: Database["public"]["Enums"]["coupon_status"]
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "welcome_coupons_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_customer_exists: {
        Args: { _email: string; _phone: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "staff" | "customer"
      appointment_status:
        | "CONFIRMED"
        | "RESCHEDULED"
        | "CANCELLED"
        | "COMPLETED"
        | "NO_SHOW"
      audit_actor_role: "CUSTOMER" | "STAFF" | "MANAGER" | "ADMIN" | "SYSTEM"
      campaign_channel: "WHATSAPP"
      campaign_status: "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "CANCELLED"
      coupon_status: "ACTIVE" | "USED" | "EXPIRED"
      customer_status: "PENDING_VERIFICATION" | "ACTIVE" | "DISABLED"
      delivery_status: "TARGETED" | "SENT" | "DELIVERED" | "FAILED"
      points_movement_type: "EARN" | "REDEEM" | "ADJUST" | "EXPIRE"
      reward_status: "AVAILABLE" | "REDEEMED" | "EXPIRED"
      reward_type:
        | "SCALP_DIAGNOSIS"
        | "EXPRESS_TREATMENT"
        | "RETAIL_VOUCHER"
        | "PACK_UPGRADE"
        | "CUSTOM"
      salon_section: "CABALLEROS" | "SENORAS" | "ESTETICA"
      subscription_plan: "LADIES_59" | "MEN_19" | "LADIES_39" | "MEN_17"
      subscription_status:
        | "ACTIVE"
        | "PAYMENT_DUE"
        | "CANCELLED_END_OF_PERIOD"
        | "EXPIRED"
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
      app_role: ["admin", "manager", "staff", "customer"],
      appointment_status: [
        "CONFIRMED",
        "RESCHEDULED",
        "CANCELLED",
        "COMPLETED",
        "NO_SHOW",
      ],
      audit_actor_role: ["CUSTOMER", "STAFF", "MANAGER", "ADMIN", "SYSTEM"],
      campaign_channel: ["WHATSAPP"],
      campaign_status: ["DRAFT", "SCHEDULED", "SENDING", "SENT", "CANCELLED"],
      coupon_status: ["ACTIVE", "USED", "EXPIRED"],
      customer_status: ["PENDING_VERIFICATION", "ACTIVE", "DISABLED"],
      delivery_status: ["TARGETED", "SENT", "DELIVERED", "FAILED"],
      points_movement_type: ["EARN", "REDEEM", "ADJUST", "EXPIRE"],
      reward_status: ["AVAILABLE", "REDEEMED", "EXPIRED"],
      reward_type: [
        "SCALP_DIAGNOSIS",
        "EXPRESS_TREATMENT",
        "RETAIL_VOUCHER",
        "PACK_UPGRADE",
        "CUSTOM",
      ],
      salon_section: ["CABALLEROS", "SENORAS", "ESTETICA"],
      subscription_plan: ["LADIES_59", "MEN_19", "LADIES_39", "MEN_17"],
      subscription_status: [
        "ACTIVE",
        "PAYMENT_DUE",
        "CANCELLED_END_OF_PERIOD",
        "EXPIRED",
      ],
    },
  },
} as const
