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
      appointment_blocks: {
        Row: {
          appointment_id: string
          id: string
          occupied_range: unknown
          phase: string
          professional_id: string
          salon_id: string
        }
        Insert: {
          appointment_id: string
          id?: string
          occupied_range: unknown
          phase: string
          professional_id: string
          salon_id: string
        }
        Update: {
          appointment_id?: string
          id?: string
          occupied_range?: unknown
          phase?: string
          professional_id?: string
          salon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_blocks_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_blocks_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_blocks_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_history: {
        Row: {
          action: string
          appointment_id: string
          changed_at: string
          changed_by: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
          salon_id: string
        }
        Insert: {
          action: string
          appointment_id: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          salon_id: string
        }
        Update: {
          action?: string
          appointment_id?: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          salon_id?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          cancelled_reason: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          ends_at: string
          id: string
          notes: string | null
          price_cents: number
          professional_id: string
          salon_id: string
          service_id: string
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id: string
          ends_at: string
          id?: string
          notes?: string | null
          price_cents?: number
          professional_id: string
          salon_id: string
          service_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          ends_at?: string
          id?: string
          notes?: string | null
          price_cents?: number
          professional_id?: string
          salon_id?: string
          service_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "appointments_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "salon_id"]
          },
        ]
      }
      customer_history: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          customer_id: string
          id: number
          new_data: Json | null
          old_data: Json | null
          salon_id: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          customer_id: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          salon_id: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          customer_id?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          salon_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          birth_date: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          marketing_consent: boolean
          notes: string | null
          phone: string | null
          phone_e164: string | null
          qr_token: string
          salon_id: string
          tax_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          marketing_consent?: boolean
          notes?: string | null
          phone?: string | null
          phone_e164?: string | null
          qr_token?: string
          salon_id: string
          tax_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          marketing_consent?: boolean
          notes?: string | null
          phone?: string | null
          phone_e164?: string | null
          qr_token?: string
          salon_id?: string
          tax_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          salon_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          salon_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          salon_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_accounts: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          last_activity_at: string | null
          last_visit_at: string | null
          points_balance: number
          salon_id: string
          updated_at: string
          visits_total: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          last_activity_at?: string | null
          last_visit_at?: string | null
          points_balance?: number
          salon_id: string
          updated_at?: string
          visits_total?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          last_activity_at?: string | null
          last_visit_at?: string | null
          points_balance?: number
          salon_id?: string
          updated_at?: string
          visits_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "loyalty_accounts_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
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
          reason: string | null
          ref_id: string | null
          ref_type: string | null
          salon_id: string
          type: Database["public"]["Enums"]["points_movement_type"]
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          points: number
          reason?: string | null
          ref_id?: string | null
          ref_type?: string | null
          salon_id: string
          type: Database["public"]["Enums"]["points_movement_type"]
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          points?: number
          reason?: string | null
          ref_id?: string | null
          ref_type?: string | null
          salon_id?: string
          type?: Database["public"]["Enums"]["points_movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "points_movements_customer_id_fkey"
            columns: ["customer_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "points_movements_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_invoices: {
        Row: {
          created_at: string
          currency: string
          current_hash: string
          full_number: string | null
          hash_algorithm: string
          id: string
          invoice_type: Database["public"]["Enums"]["pos_invoice_type"]
          issued_at: string
          issuer_data: Json | null
          previous_hash: string | null
          recipient_data: Json | null
          sale_id: string | null
          salon_id: string
          sequential_number: number
          series: string
          tax_breakdown: Json
          tax_cents: number
          taxable_base_cents: number
          total_cents: number
        }
        Insert: {
          created_at?: string
          currency?: string
          current_hash: string
          full_number?: string | null
          hash_algorithm?: string
          id?: string
          invoice_type?: Database["public"]["Enums"]["pos_invoice_type"]
          issued_at?: string
          issuer_data?: Json | null
          previous_hash?: string | null
          recipient_data?: Json | null
          sale_id?: string | null
          salon_id: string
          sequential_number: number
          series: string
          tax_breakdown: Json
          tax_cents: number
          taxable_base_cents: number
          total_cents: number
        }
        Update: {
          created_at?: string
          currency?: string
          current_hash?: string
          full_number?: string | null
          hash_algorithm?: string
          id?: string
          invoice_type?: Database["public"]["Enums"]["pos_invoice_type"]
          issued_at?: string
          issuer_data?: Json | null
          previous_hash?: string | null
          recipient_data?: Json | null
          sale_id?: string | null
          salon_id?: string
          sequential_number?: number
          series?: string
          tax_breakdown?: Json
          tax_cents?: number
          taxable_base_cents?: number
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_invoices_chain_fkey"
            columns: ["salon_id", "previous_hash"]
            isOneToOne: false
            referencedRelation: "pos_invoices"
            referencedColumns: ["salon_id", "current_hash"]
          },
          {
            foreignKeyName: "pos_invoices_sale_id_fkey"
            columns: ["sale_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "pos_invoices_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_payment_methods: {
        Row: {
          active: boolean
          affects_cash_drawer: boolean
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["pos_payment_method"]
          name: string
          salon_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          affects_cash_drawer?: boolean
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["pos_payment_method"]
          name: string
          salon_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          affects_cash_drawer?: boolean
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["pos_payment_method"]
          name?: string
          salon_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_payment_methods_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_payments: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["pos_payment_method"]
          paid_at: string
          payment_method_id: string | null
          reference: string | null
          sale_id: string
          salon_id: string
          session_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["pos_payment_method"]
          paid_at?: string
          payment_method_id?: string | null
          reference?: string | null
          sale_id: string
          salon_id: string
          session_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["pos_payment_method"]
          paid_at?: string
          payment_method_id?: string | null
          reference?: string | null
          sale_id?: string
          salon_id?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_payments_payment_method_id_fkey"
            columns: ["payment_method_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "pos_payment_methods"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "pos_payments_sale_id_fkey"
            columns: ["sale_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "pos_payments_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_payments_session_id_fkey"
            columns: ["session_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id", "salon_id"]
          },
        ]
      }
      pos_sale_lines: {
        Row: {
          created_at: string
          description: string
          discount_cents: number
          id: string
          item_kind: string | null
          line_total_cents: number
          product_id: string | null
          quantity: number
          sale_id: string
          salon_id: string
          service_id: string | null
          unit_price_cents: number
          updated_at: string
          vat_rate: number
        }
        Insert: {
          created_at?: string
          description: string
          discount_cents?: number
          id?: string
          item_kind?: string | null
          line_total_cents?: number
          product_id?: string | null
          quantity?: number
          sale_id: string
          salon_id: string
          service_id?: string | null
          unit_price_cents?: number
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          created_at?: string
          description?: string
          discount_cents?: number
          id?: string
          item_kind?: string | null
          line_total_cents?: number
          product_id?: string | null
          quantity?: number
          sale_id?: string
          salon_id?: string
          service_id?: string | null
          unit_price_cents?: number
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_lines_product_id_fkey"
            columns: ["product_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "pos_sale_lines_sale_id_fkey"
            columns: ["sale_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "pos_sale_lines_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_lines_service_id_fkey"
            columns: ["service_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "salon_id"]
          },
        ]
      }
      pos_sales: {
        Row: {
          appointment_id: string | null
          created_at: string
          currency: string
          customer_id: string | null
          discount_cents: number
          id: string
          notes: string | null
          professional_id: string | null
          salon_id: string
          session_id: string | null
          sold_at: string
          sold_by: string | null
          status: Database["public"]["Enums"]["pos_sale_status"]
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_cents?: number
          id?: string
          notes?: string | null
          professional_id?: string | null
          salon_id: string
          session_id?: string | null
          sold_at?: string
          sold_by?: string | null
          status?: Database["public"]["Enums"]["pos_sale_status"]
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount_cents?: number
          id?: string
          notes?: string | null
          professional_id?: string | null
          salon_id?: string
          session_id?: string | null
          sold_at?: string
          sold_by?: string | null
          status?: Database["public"]["Enums"]["pos_sale_status"]
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_appointment_id_fkey"
            columns: ["appointment_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "pos_sales_customer_id_fkey"
            columns: ["customer_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "pos_sales_professional_id_fkey"
            columns: ["professional_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "pos_sales_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_session_id_fkey"
            columns: ["session_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id", "salon_id"]
          },
        ]
      }
      pos_sessions: {
        Row: {
          cash_variance_cents: number | null
          closed_at: string | null
          closed_by: string | null
          closing_totals: Json | null
          counted_cash_cents: number | null
          created_at: string
          currency: string
          expected_cash_cents: number | null
          id: string
          location_id: string | null
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_float_cents: number
          salon_id: string
          status: Database["public"]["Enums"]["pos_session_status"]
          updated_at: string
        }
        Insert: {
          cash_variance_cents?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_totals?: Json | null
          counted_cash_cents?: number | null
          created_at?: string
          currency?: string
          expected_cash_cents?: number | null
          id?: string
          location_id?: string | null
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_float_cents?: number
          salon_id: string
          status?: Database["public"]["Enums"]["pos_session_status"]
          updated_at?: string
        }
        Update: {
          cash_variance_cents?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_totals?: Json | null
          counted_cash_cents?: number | null
          created_at?: string
          currency?: string
          expected_cash_cents?: number | null
          id?: string
          location_id?: string | null
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_float_cents?: number
          salon_id?: string
          status?: Database["public"]["Enums"]["pos_session_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sessions_location_id_fkey"
            columns: ["location_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "pos_sessions_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          description: string | null
          id: string
          name: string
          price_cents: number
          salon_id: string
          stock: number | null
          updated_at: string
          vat_rate: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name: string
          price_cents?: number
          salon_id: string
          stock?: number | null
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name?: string
          price_cents?: number
          salon_id?: string
          stock?: number | null
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_schedules: {
        Row: {
          created_at: string
          end_time: string
          id: string
          professional_id: string
          salon_id: string
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          professional_id: string
          salon_id: string
          start_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          professional_id?: string
          salon_id?: string
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "professional_schedules_professional_id_fkey"
            columns: ["professional_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "professional_schedules_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_services: {
        Row: {
          created_at: string
          professional_id: string
          salon_id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          professional_id: string
          salon_id: string
          service_id: string
        }
        Update: {
          created_at?: string
          professional_id?: string
          salon_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_services_professional_id_fkey"
            columns: ["professional_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "professional_services_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_services_service_id_fkey"
            columns: ["service_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "salon_id"]
          },
        ]
      }
      professionals: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          location_id: string
          phone: string | null
          salon_id: string
          specialties: string[]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          location_id: string
          phone?: string | null
          salon_id: string
          specialties?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          location_id?: string
          phone?: string | null
          salon_id?: string
          specialties?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_location_id_fkey"
            columns: ["location_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "professionals_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
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
          salon_id: string
          status: Database["public"]["Enums"]["reward_status"]
          type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          customer_id: string
          expires_at: string
          id?: string
          redeemed_at?: string | null
          salon_id: string
          status?: Database["public"]["Enums"]["reward_status"]
          type: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          redeemed_at?: string | null
          salon_id?: string
          status?: Database["public"]["Enums"]["reward_status"]
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_customer_id_fkey"
            columns: ["customer_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "rewards_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
          salon_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          salon_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          salon_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salon_members_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      salons: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          email: string | null
          fiscal_address: string | null
          id: string
          legal_name: string | null
          name: string
          phone: string | null
          settings: Json
          slug: string
          tax_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          email?: string | null
          fiscal_address?: string | null
          id?: string
          legal_name?: string | null
          name: string
          phone?: string | null
          settings?: Json
          slug: string
          tax_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          email?: string | null
          fiscal_address?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          phone?: string | null
          settings?: Json
          slug?: string
          tax_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_exceptions: {
        Row: {
          created_at: string
          end_time: string | null
          exception_date: string
          id: string
          is_available: boolean
          professional_id: string
          reason: string | null
          salon_id: string
          start_time: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          exception_date: string
          id?: string
          is_available?: boolean
          professional_id: string
          reason?: string | null
          salon_id: string
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_time?: string | null
          exception_date?: string
          id?: string
          is_available?: boolean
          professional_id?: string
          reason?: string | null
          salon_id?: string
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_exceptions_professional_id_fkey"
            columns: ["professional_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "schedule_exceptions_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          application_min: number
          category: string | null
          created_at: string
          currency: string
          description: string | null
          duration_minutes: number | null
          duration_minutes_total: number | null
          exposure_min: number
          id: string
          name: string
          post_exposure_min: number
          price_cents: number
          salon_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          application_min: number
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number | null
          duration_minutes_total?: number | null
          exposure_min?: number
          id?: string
          name: string
          post_exposure_min?: number
          price_cents?: number
          salon_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          application_min?: number
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number | null
          duration_minutes_total?: number | null
          exposure_min?: number
          id?: string
          name?: string
          post_exposure_min?: number
          price_cents?: number
          salon_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          amount_cents: number
          appointment_id: string | null
          created_at: string
          currency: string
          customer_id: string
          id: string
          notes: string | null
          professional_id: string | null
          salon_id: string
          service_id: string | null
          service_name: string
          visited_at: string
        }
        Insert: {
          amount_cents?: number
          appointment_id?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          id?: string
          notes?: string | null
          professional_id?: string | null
          salon_id: string
          service_id?: string | null
          service_name: string
          visited_at?: string
        }
        Update: {
          amount_cents?: number
          appointment_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          id?: string
          notes?: string | null
          professional_id?: string | null
          salon_id?: string
          service_id?: string | null
          service_name?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_appointment_id_fkey"
            columns: ["appointment_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "visits_customer_id_fkey"
            columns: ["customer_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "visits_professional_id_fkey"
            columns: ["professional_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "visits_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_service_id_fkey"
            columns: ["service_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "salon_id"]
          },
        ]
      }
      welcome_coupons: {
        Row: {
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          percent_off: number
          salon_id: string
          status: Database["public"]["Enums"]["coupon_status"]
          updated_at: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          expires_at: string
          id?: string
          percent_off: number
          salon_id: string
          status?: Database["public"]["Enums"]["coupon_status"]
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          percent_off?: number
          salon_id?: string
          status?: Database["public"]["Enums"]["coupon_status"]
          updated_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "welcome_coupons_customer_id_fkey"
            columns: ["customer_id", "salon_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "salon_id"]
          },
          {
            foreignKeyName: "welcome_coupons_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_reminder_queue: {
        Row: {
          appointment_id: string
          attempts: number
          created_at: string
          customer_phone: string
          id: string
          last_error: string | null
          max_attempts: number
          next_retry_at: string | null
          reminder_type: Database["public"]["Enums"]["reminder_type"]
          salon_id: string
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          twilio_message_sid: string | null
          updated_at: string
        }
        Insert: {
          appointment_id: string
          attempts?: number
          created_at?: string
          customer_phone: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          reminder_type: Database["public"]["Enums"]["reminder_type"]
          salon_id: string
          scheduled_for: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          twilio_message_sid?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          attempts?: number
          created_at?: string
          customer_phone?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          reminder_type?: Database["public"]["Enums"]["reminder_type"]
          salon_id?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          twilio_message_sid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_reminder_queue_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_reminder_queue_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_salon_branding: {
        Args: {
          p_slug: string
        }
        Returns: {
          id: string
          name: string
          slug: string
          logo_url: string | null
          primary_color: string
          secondary_color: string | null
        }[]
      }
      register_my_customer_account: {
        Args: {
          p_email?: string
          p_full_name: string
          p_phone: string
          p_salon_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      appointment_status:
        | "pending"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      coupon_status: "ACTIVE" | "USED" | "EXPIRED"
      member_role: "owner" | "manager" | "staff"
      points_movement_type: "EARN" | "REDEEM" | "ADJUST" | "EXPIRE"
      pos_invoice_type: "ticket" | "completa"
      pos_payment_method:
        | "efectivo"
        | "tarjeta"
        | "bizum"
        | "transferencia"
        | "otro"
      pos_sale_status: "open" | "completed" | "voided" | "refunded"
      pos_session_status: "open" | "closed"
      reminder_status: "pending" | "sending" | "sent" | "failed" | "skipped"
      reminder_type:
        | "confirmacion"
        | "recordatorio_24h"
        | "recordatorio_2h"
        | "post_visita"
      reward_status: "AVAILABLE" | "REDEEMED" | "EXPIRED"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      appointment_status: [
        "pending",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      coupon_status: ["ACTIVE", "USED", "EXPIRED"],
      member_role: ["owner", "manager", "staff"],
      points_movement_type: ["EARN", "REDEEM", "ADJUST", "EXPIRE"],
      pos_invoice_type: ["ticket", "completa"],
      pos_payment_method: [
        "efectivo",
        "tarjeta",
        "bizum",
        "transferencia",
        "otro",
      ],
      pos_sale_status: ["open", "completed", "voided", "refunded"],
      pos_session_status: ["open", "closed"],
      reminder_status: ["pending", "sending", "sent", "failed", "skipped"],
      reminder_type: [
        "confirmacion",
        "recordatorio_24h",
        "recordatorio_2h",
        "post_visita",
      ],
      reward_status: ["AVAILABLE", "REDEEMED", "EXPIRED"],
    },
  },
} as const
