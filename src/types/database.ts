/**
 * Tipos de la base de datos Supabase — salon-os.
 *
 * Generados a mano a partir de supabase/migrations/ (esquema v1).
 * Cuando el proyecto Supabase esté provisionado, regenerar con:
 *   npx supabase gen types typescript --project-id <project-ref> > src/types/database.ts
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type MemberRole = "owner" | "manager" | "staff";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type HistoryAction = "INSERT" | "UPDATE" | "DELETE";

export type ReminderType =
  | "confirmacion"
  | "recordatorio_24h"
  | "recordatorio_2h"
  | "post_visita";

export type ReminderStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "skipped";

// TPV (Terminal Punto de Venta) — módulo de caja/ventas
export type PosSaleStatus = "open" | "completed" | "voided" | "refunded";

export type PosPaymentMethod =
  | "efectivo"
  | "tarjeta"
  | "bizum"
  | "transferencia"
  | "otro";

export type PosSessionStatus = "open" | "closed";

/** Tipo derivado (generado) de una línea de venta. */
export type PosSaleLineItemKind = "service" | "product" | "manual";

/**
 * Tipo de factura Veri*factu (registro de facturación de alta).
 * `ticket` = simplificada (F2, sin receptor) | `completa` = ordinaria (F1, con receptor).
 */
export type PosInvoiceType = "ticket" | "completa";

// Fidelización (add-on premium) — valores en MAYÚSCULAS por contrato denueveanueve
/** Movimiento del libro mayor de puntos. */
export type PointsMovementType = "EARN" | "REDEEM" | "ADJUST" | "EXPIRE";

/** Estado del cupón de bienvenida. */
export type CouponStatus = "ACTIVE" | "USED" | "EXPIRED";

/** Estado de una recompensa de hito. */
export type RewardStatus = "AVAILABLE" | "REDEEMED" | "EXPIRED";

/**
 * Add-on contratable por salón (entitlement). Espejo TS del enum
 * `public.salon_feature` (migración 20260718100000_salon_features). En minúsculas,
 * como el resto de enums de dominio. La AUSENCIA de fila en `salon_features` = no
 * contratado; el gate exige además `enabled = true`.
 */
export type SalonFeature =
  | "loyalty"
  | "client_app"
  | "staff_app"
  | "ai_receptionist"
  | "pos";

export interface Database {
  public: {
    Tables: {
      salons: {
        Row: {
          id: string;
          name: string;
          slug: string;
          timezone: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          // Datos fiscales del emisor (facturación)
          tax_id: string | null; // NIF/CIF
          legal_name: string | null; // razón social
          fiscal_address: string | null; // domicilio fiscal
          settings: Json;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          timezone?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          tax_id?: string | null;
          legal_name?: string | null;
          fiscal_address?: string | null;
          settings?: Json;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          timezone?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          tax_id?: string | null;
          legal_name?: string | null;
          fiscal_address?: string | null;
          settings?: Json;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      locations: {
        Row: {
          id: string;
          salon_id: string;
          name: string;
          slug: string;
          address: string | null;
          phone: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          slug: string;
          address?: string | null;
          phone?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          name?: string;
          slug?: string;
          address?: string | null;
          phone?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "locations_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      salon_members: {
        Row: {
          id: string;
          salon_id: string;
          user_id: string;
          role: MemberRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          user_id: string;
          role?: MemberRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          user_id?: string;
          role?: MemberRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "salon_members_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          id: string;
          salon_id: string;
          name: string;
          description: string | null;
          category: string | null;
          // Duración por fases (editables)
          application_min: number;
          exposure_min: number;
          post_exposure_min: number;
          // Columnas generadas (read-only)
          duration_minutes_total: number;
          duration_minutes: number; // alias generado de duration_minutes_total
          price_cents: number;
          currency: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          description?: string | null;
          category?: string | null;
          application_min: number;    // requerido, sin default
          exposure_min?: number;      // default 0
          post_exposure_min?: number; // default 0
          // duration_minutes y duration_minutes_total son generadas: omitir en Insert
          price_cents?: number;
          currency?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          name?: string;
          description?: string | null;
          category?: string | null;
          application_min?: number;
          exposure_min?: number;
          post_exposure_min?: number;
          // duration_minutes y duration_minutes_total son generadas: omitir en Update
          price_cents?: number;
          currency?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      professionals: {
        Row: {
          id: string;
          salon_id: string;
          location_id: string;
          user_id: string | null;
          full_name: string;
          email: string | null;
          phone: string | null;
          specialties: string[];
          color: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          location_id: string;
          user_id?: string | null;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          specialties?: string[];
          color?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          location_id?: string;
          user_id?: string | null;
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          specialties?: string[];
          color?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "professionals_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professionals_location_id_fkey";
            columns: ["location_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      professional_services: {
        Row: {
          professional_id: string;
          service_id: string;
          salon_id: string;
          created_at: string;
        };
        Insert: {
          professional_id: string;
          service_id: string;
          salon_id: string;
          created_at?: string;
        };
        Update: {
          professional_id?: string;
          service_id?: string;
          salon_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "professional_services_professional_id_fkey";
            columns: ["professional_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "professional_services_service_id_fkey";
            columns: ["service_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "professional_services_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          id: string;
          salon_id: string;
          full_name: string;
          email: string | null;
          phone: string | null;
          birth_date: string | null;
          notes: string | null;
          marketing_consent: boolean;
          // Datos fiscales del receptor (opcionales, para factura completa)
          tax_id: string | null; // NIF/CIF
          address: string | null; // dirección postal/fiscal
          // Fidelización: token del cliente (QR), único global, generado por DEFAULT
          qr_token: string;
          // Enlace OPCIONAL ficha ↔ cuenta de auth (app de cliente). NULL = sin cuenta.
          // Único parcial (salon_id, user_id). Migración 20260717100000_customers_user_id.
          user_id: string | null;
          // Teléfono canónico E.164, GENERADO (stored) desde phone vía app.normalize_phone().
          // No escribible; único parcial (salon_id, phone_e164). Migración 20260717110000.
          phone_e164: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          birth_date?: string | null;
          notes?: string | null;
          marketing_consent?: boolean;
          tax_id?: string | null;
          address?: string | null;
          qr_token?: string; // lo genera el DEFAULT si se omite
          user_id?: string | null; // NULL por defecto: la mayoría de fichas no tienen cuenta
          // phone_e164 NO va en Insert: es una columna GENERATED ALWAYS (no escribible).
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          birth_date?: string | null;
          notes?: string | null;
          marketing_consent?: boolean;
          tax_id?: string | null;
          address?: string | null;
          qr_token?: string;
          user_id?: string | null;
          // phone_e164 NO va en Update: columna GENERATED (se recalcula sola desde phone).
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          salon_id: string;
          name: string;
          description: string | null;
          price_cents: number;
          currency: string;
          vat_rate: number; // tipo de IVA en porcentaje (p. ej. 21.00)
          stock: number | null; // null = producto no inventariado
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          description?: string | null;
          price_cents?: number;
          currency?: string;
          vat_rate?: number;
          stock?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          name?: string;
          description?: string | null;
          price_cents?: number;
          currency?: string;
          vat_rate?: number;
          stock?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          professional_id: string;
          service_id: string;
          status: AppointmentStatus;
          starts_at: string;
          ends_at: string;
          price_cents: number;
          currency: string;
          notes: string | null;
          cancelled_reason: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          professional_id: string;
          service_id: string;
          status?: AppointmentStatus;
          starts_at: string;
          ends_at: string;
          price_cents?: number;
          currency?: string;
          notes?: string | null;
          cancelled_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          professional_id?: string;
          service_id?: string;
          status?: AppointmentStatus;
          starts_at?: string;
          ends_at?: string;
          price_cents?: number;
          currency?: string;
          notes?: string | null;
          cancelled_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_customer_id_fkey";
            columns: ["customer_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "appointments_professional_id_fkey";
            columns: ["professional_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "appointments_service_id_fkey";
            columns: ["service_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      visits: {
        Row: {
          id: string;
          salon_id: string;
          appointment_id: string | null;
          customer_id: string;
          professional_id: string | null;
          service_id: string | null;
          service_name: string;
          amount_cents: number;
          currency: string;
          visited_at: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          appointment_id?: string | null;
          customer_id: string;
          professional_id?: string | null;
          service_id?: string | null;
          service_name: string;
          amount_cents?: number;
          currency?: string;
          visited_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          appointment_id?: string | null;
          customer_id?: string;
          professional_id?: string | null;
          service_id?: string | null;
          service_name?: string;
          amount_cents?: number;
          currency?: string;
          visited_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visits_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visits_appointment_id_fkey";
            columns: ["appointment_id", "salon_id"];
            isOneToOne: true;
            referencedRelation: "appointments";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "visits_customer_id_fkey";
            columns: ["customer_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "visits_professional_id_fkey";
            columns: ["professional_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "visits_service_id_fkey";
            columns: ["service_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      professional_schedules: {
        Row: {
          id: string;
          salon_id: string;
          professional_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          professional_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          professional_id?: string;
          weekday?: number;
          start_time?: string;
          end_time?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "professional_schedules_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professional_schedules_professional_id_fkey";
            columns: ["professional_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      schedule_exceptions: {
        Row: {
          id: string;
          salon_id: string;
          professional_id: string;
          exception_date: string;
          is_available: boolean;
          start_time: string | null;
          end_time: string | null;
          reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          professional_id: string;
          exception_date: string;
          is_available?: boolean;
          start_time?: string | null;
          end_time?: string | null;
          reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          professional_id?: string;
          exception_date?: string;
          is_available?: boolean;
          start_time?: string | null;
          end_time?: string | null;
          reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_exceptions_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_exceptions_professional_id_fkey";
            columns: ["professional_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      appointment_blocks: {
        Row: {
          id: string;
          appointment_id: string;
          professional_id: string;
          salon_id: string;
          /** tstzrange devuelto como literal PostgreSQL, ej: ["2026-01-01 10:00:00+00","2026-01-01 10:15:00+00") */
          occupied_range: string;
          phase: "application" | "post_exposure";
        };
        // Gestionada exclusivamente por trigger SECURITY DEFINER; nunca se inserta desde el cliente.
        Insert: {
          id?: string;
          appointment_id: string;
          professional_id: string;
          salon_id: string;
          occupied_range: string;
          phase: "application" | "post_exposure";
        };
        Update: {
          id?: string;
          appointment_id?: string;
          professional_id?: string;
          salon_id?: string;
          occupied_range?: string;
          phase?: "application" | "post_exposure";
        };
        Relationships: [
          {
            foreignKeyName: "appointment_blocks_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_blocks_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_blocks_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      appointment_history: {
        Row: {
          id: number;
          appointment_id: string;
          salon_id: string;
          action: HistoryAction;
          changed_by: string | null;
          old_data: Json | null;
          new_data: Json | null;
          changed_at: string;
        };
        // Escritura solo vía trigger SECURITY DEFINER: Insert/Update nunca
        // se usan desde el cliente, pero el formato gen-types los exige.
        Insert: {
          id?: never;
          appointment_id: string;
          salon_id: string;
          action: HistoryAction;
          changed_by?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          changed_at?: string;
        };
        Update: {
          id?: never;
          appointment_id?: string;
          salon_id?: string;
          action?: HistoryAction;
          changed_by?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          changed_at?: string;
        };
        Relationships: [];
      };
      customer_history: {
        Row: {
          id: number;
          customer_id: string;
          salon_id: string;
          action: Exclude<HistoryAction, "INSERT">;
          changed_by: string | null;
          old_data: Json | null;
          new_data: Json | null;
          changed_at: string;
        };
        Insert: {
          id?: never;
          customer_id: string;
          salon_id: string;
          action: Exclude<HistoryAction, "INSERT">;
          changed_by?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          changed_at?: string;
        };
        Update: {
          id?: never;
          customer_id?: string;
          salon_id?: string;
          action?: Exclude<HistoryAction, "INSERT">;
          changed_by?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          changed_at?: string;
        };
        Relationships: [];
      };
      whatsapp_reminder_queue: {
        Row: {
          id: string;
          salon_id: string;
          appointment_id: string;
          reminder_type: ReminderType;
          status: ReminderStatus;
          scheduled_for: string;
          attempts: number;
          max_attempts: number;
          next_retry_at: string | null;
          sent_at: string | null;
          twilio_message_sid: string | null;
          customer_phone: string;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          appointment_id: string;
          reminder_type: ReminderType;
          status?: ReminderStatus;
          scheduled_for: string;
          attempts?: number;
          max_attempts?: number;
          next_retry_at?: string | null;
          sent_at?: string | null;
          twilio_message_sid?: string | null;
          customer_phone: string;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          appointment_id?: string;
          reminder_type?: ReminderType;
          status?: ReminderStatus;
          scheduled_for?: string;
          attempts?: number;
          max_attempts?: number;
          next_retry_at?: string | null;
          sent_at?: string | null;
          twilio_message_sid?: string | null;
          customer_phone?: string;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_reminder_queue_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_reminder_queue_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
        ];
      };
      // TPV (Terminal Punto de Venta) --------------------------------------------
      pos_payment_methods: {
        Row: {
          id: string;
          salon_id: string;
          kind: PosPaymentMethod; // tipo base del método
          name: string; // etiqueta visible
          affects_cash_drawer: boolean; // mueve efectivo físico (arqueo)
          active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          kind: PosPaymentMethod;
          name: string;
          affects_cash_drawer?: boolean;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          kind?: PosPaymentMethod;
          name?: string;
          affects_cash_drawer?: boolean;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pos_payment_methods_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      pos_sessions: {
        Row: {
          id: string;
          salon_id: string;
          location_id: string | null;
          status: PosSessionStatus;
          currency: string;
          opened_by: string | null;
          opened_at: string;
          opening_float_cents: number; // fondo de caja inicial
          closed_by: string | null;
          closed_at: string | null;
          expected_cash_cents: number | null; // efectivo esperado
          counted_cash_cents: number | null; // efectivo contado
          cash_variance_cents: number | null; // descuadre (puede ser negativo)
          closing_totals: Json | null; // snapshot de totales por método
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          location_id?: string | null;
          status?: PosSessionStatus;
          currency?: string;
          opened_by?: string | null;
          opened_at?: string;
          opening_float_cents?: number;
          closed_by?: string | null;
          closed_at?: string | null;
          expected_cash_cents?: number | null;
          counted_cash_cents?: number | null;
          cash_variance_cents?: number | null;
          closing_totals?: Json | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          location_id?: string | null;
          status?: PosSessionStatus;
          currency?: string;
          opened_by?: string | null;
          opened_at?: string;
          opening_float_cents?: number;
          closed_by?: string | null;
          closed_at?: string | null;
          expected_cash_cents?: number | null;
          counted_cash_cents?: number | null;
          cash_variance_cents?: number | null;
          closing_totals?: Json | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pos_sessions_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pos_sessions_location_id_fkey";
            columns: ["location_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      pos_sales: {
        Row: {
          id: string;
          salon_id: string;
          session_id: string | null;
          appointment_id: string | null;
          customer_id: string | null;
          professional_id: string | null;
          status: PosSaleStatus;
          subtotal_cents: number; // base imponible (sin IVA)
          discount_cents: number;
          tax_cents: number; // IVA total
          total_cents: number; // total a cobrar
          currency: string;
          sold_by: string | null;
          sold_at: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          session_id?: string | null;
          appointment_id?: string | null;
          customer_id?: string | null;
          professional_id?: string | null;
          status?: PosSaleStatus;
          subtotal_cents?: number;
          discount_cents?: number;
          tax_cents?: number;
          total_cents?: number;
          currency?: string;
          sold_by?: string | null;
          sold_at?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          session_id?: string | null;
          appointment_id?: string | null;
          customer_id?: string | null;
          professional_id?: string | null;
          status?: PosSaleStatus;
          subtotal_cents?: number;
          discount_cents?: number;
          tax_cents?: number;
          total_cents?: number;
          currency?: string;
          sold_by?: string | null;
          sold_at?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pos_sales_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pos_sales_session_id_fkey";
            columns: ["session_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "pos_sessions";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "pos_sales_appointment_id_fkey";
            columns: ["appointment_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "pos_sales_customer_id_fkey";
            columns: ["customer_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "pos_sales_professional_id_fkey";
            columns: ["professional_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      pos_sale_lines: {
        Row: {
          id: string;
          salon_id: string;
          sale_id: string;
          service_id: string | null;
          product_id: string | null;
          item_kind: PosSaleLineItemKind; // generado (read-only)
          description: string; // snapshot del nombre
          quantity: number; // numeric(12,3)
          unit_price_cents: number; // precio unitario (snapshot)
          discount_cents: number;
          vat_rate: number; // IVA aplicado (%)
          line_total_cents: number; // total de la línea (IVA incl.)
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          sale_id: string;
          service_id?: string | null;
          product_id?: string | null;
          // item_kind es generada: omitir en Insert
          description: string;
          quantity?: number;
          unit_price_cents?: number;
          discount_cents?: number;
          vat_rate?: number;
          line_total_cents?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          sale_id?: string;
          service_id?: string | null;
          product_id?: string | null;
          // item_kind es generada: omitir en Update
          description?: string;
          quantity?: number;
          unit_price_cents?: number;
          discount_cents?: number;
          vat_rate?: number;
          line_total_cents?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pos_sale_lines_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pos_sale_lines_sale_id_fkey";
            columns: ["sale_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "pos_sales";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "pos_sale_lines_service_id_fkey";
            columns: ["service_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "pos_sale_lines_product_id_fkey";
            columns: ["product_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      pos_payments: {
        Row: {
          id: string;
          salon_id: string;
          sale_id: string;
          session_id: string | null;
          method: PosPaymentMethod; // tipo base (autoridad de reconciliación)
          payment_method_id: string | null; // catálogo del salón (opcional)
          amount_cents: number;
          paid_at: string;
          reference: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          sale_id: string;
          session_id?: string | null;
          method: PosPaymentMethod;
          payment_method_id?: string | null;
          amount_cents: number;
          paid_at?: string;
          reference?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          sale_id?: string;
          session_id?: string | null;
          method?: PosPaymentMethod;
          payment_method_id?: string | null;
          amount_cents?: number;
          paid_at?: string;
          reference?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pos_payments_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pos_payments_sale_id_fkey";
            columns: ["sale_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "pos_sales";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "pos_payments_session_id_fkey";
            columns: ["session_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "pos_sessions";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "pos_payments_payment_method_id_fkey";
            columns: ["payment_method_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "pos_payment_methods";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      pos_invoices: {
        Row: {
          id: string;
          salon_id: string;
          sale_id: string | null; // venta de origen (opcional)
          invoice_type: PosInvoiceType;
          series: string;
          sequential_number: number; // bigint (correlativo por serie)
          full_number: string; // generado: serie-número (read-only)
          issued_at: string; // fecha de expedición
          currency: string;
          tax_breakdown: Json; // array [{vat_rate, base_cents, cuota_cents, total_cents}]
          taxable_base_cents: number; // Σ bases imponibles
          tax_cents: number; // Σ cuotas de IVA
          total_cents: number; // = taxable_base_cents + tax_cents
          issuer_data: Json | null; // snapshot emisor {tax_id, legal_name, fiscal_address}
          recipient_data: Json | null; // datos_receptor {tax_id, name, address}; null en 'ticket'
          hash_algorithm: string; // 'SHA-256'
          current_hash: string; // hash_actual (SHA-256 hex, 64)
          previous_hash: string | null; // hash_anterior_64 (null = primer registro)
          created_at: string; // marca temporal de generación del registro
        };
        Insert: {
          id?: string;
          salon_id: string;
          sale_id?: string | null;
          invoice_type?: PosInvoiceType;
          series: string;
          sequential_number: number;
          // full_number es generada: omitir en Insert
          issued_at?: string;
          currency?: string;
          tax_breakdown: Json;
          taxable_base_cents: number;
          tax_cents: number;
          total_cents: number;
          issuer_data?: Json | null;
          recipient_data?: Json | null;
          hash_algorithm?: string;
          current_hash: string;
          previous_hash?: string | null;
          created_at?: string;
        };
        // Registro inmutable: sin UPDATE (el trigger de BD aborta cualquier modificación).
        Update: never;
        Relationships: [
          {
            foreignKeyName: "pos_invoices_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pos_invoices_sale_id_fkey";
            columns: ["sale_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "pos_sales";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "pos_invoices_chain_fkey";
            columns: ["salon_id", "previous_hash"];
            isOneToOne: false;
            referencedRelation: "pos_invoices";
            referencedColumns: ["salon_id", "current_hash"];
          },
        ];
      };
      loyalty_accounts: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          points_balance: number;
          visits_total: number;
          last_visit_at: string | null;
          last_activity_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          points_balance?: number;
          visits_total?: number;
          last_visit_at?: string | null;
          last_activity_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          points_balance?: number;
          visits_total?: number;
          last_visit_at?: string | null;
          last_activity_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey";
            columns: ["customer_id", "salon_id"];
            isOneToOne: true;
            referencedRelation: "customers";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      points_movements: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          type: PointsMovementType;
          points: number;
          reason: string | null;
          ref_type: string | null;
          ref_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          type: PointsMovementType;
          points: number;
          reason?: string | null;
          ref_type?: string | null;
          ref_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          type?: PointsMovementType;
          points?: number;
          reason?: string | null;
          ref_type?: string | null;
          ref_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "points_movements_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "points_movements_customer_id_fkey";
            columns: ["customer_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      welcome_coupons: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          percent_off: number;
          status: CouponStatus;
          expires_at: string;
          used_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          percent_off: number;
          status?: CouponStatus;
          expires_at: string;
          used_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          percent_off?: number;
          status?: CouponStatus;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "welcome_coupons_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "welcome_coupons_customer_id_fkey";
            columns: ["customer_id", "salon_id"];
            isOneToOne: true;
            referencedRelation: "customers";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      rewards: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          type: string;
          code: string;
          status: RewardStatus;
          expires_at: string;
          redeemed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          type: string;
          code: string;
          status?: RewardStatus;
          expires_at: string;
          redeemed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          type?: string;
          code?: string;
          status?: RewardStatus;
          expires_at?: string;
          redeemed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rewards_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rewards_customer_id_fkey";
            columns: ["customer_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      // Entitlements por salón (productización): qué add-ons ha contratado cada
      // salón. Opt-in: activo solo si existe fila y enabled=true. La escritura la
      // hace HAT3X (service_role/backoffice), no el salón — ver migración
      // 20260718100000_salon_features.
      salon_features: {
        Row: {
          id: string;
          salon_id: string;
          feature: SalonFeature;
          enabled: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          feature: SalonFeature;
          enabled?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          feature?: SalonFeature;
          enabled?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "salon_features_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      // Marca (white-label) del salón: logo + colores. 1:1 con salons (salon_id es
      // PK y FK). Escritura solo owner/manager (RLS); lectura para cualquier miembro.
      // primary_color es NOT NULL con default '#111827'. Ver migración
      // 20260718110000_salon_branding.
      salon_branding: {
        Row: {
          salon_id: string;
          logo_url: string | null;
          primary_color: string;
          secondary_color: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          salon_id: string;
          logo_url?: string | null;
          primary_color?: string;
          secondary_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          salon_id?: string;
          logo_url?: string | null;
          primary_color?: string;
          secondary_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "salon_branding_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: true;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      // Válvulas de seguridad del salón. 1:1 con salons (salon_id es PK y FK).
      // require_phone_verification: NOT NULL DEFAULT TRUE (secure by default). Lectura
      // solo para miembros del salón (RLS); la escritura es exclusiva de HAT3X
      // (service_role). Ver migración 20260719110000_salon_security_settings.
      salon_security_settings: {
        Row: {
          salon_id: string;
          require_phone_verification: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          salon_id: string;
          require_phone_verification?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          salon_id?: string;
          require_phone_verification?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "salon_security_settings_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: true;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      // Claves de API por salón para integraciones NO-humanas (auth de servicio).
      // Se persiste SOLO el hash SHA-256 (key_hash, hex minúsculas 64) y un prefijo
      // corto NO secreto (key_prefix); NUNCA la clave en claro. Tabla de SECRETOS:
      // RLS deny-by-default SIN políticas y privilegios revocados a anon/authenticated
      // — solo service_role (backend HAT3X) la lee/escribe. Ver migración
      // 20260722100000_service_api_keys y src/lib/service-keys/. NO editable por el
      // salón: la emisión es exclusiva de HAT3X (service_role/backoffice).
      service_api_keys: {
        Row: {
          id: string;
          salon_id: string;
          name: string;
          key_hash: string;
          key_prefix: string;
          scopes: string[];
          is_active: boolean;
          created_at: string;
          last_used_at: string | null;
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          key_hash: string;
          key_prefix: string;
          scopes?: string[];
          is_active?: boolean;
          created_at?: string;
          last_used_at?: string | null;
        };
        Update: {
          id?: string;
          salon_id?: string;
          name?: string;
          key_hash?: string;
          key_prefix?: string;
          scopes?: string[];
          is_active?: boolean;
          created_at?: string;
          last_used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_api_keys_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      /**
       * Capa de AGREGACIÓN en servidor para el panel (migración
       * `20260723100000_rpc_dashboard_metrics`). Todas son SOLO LECTURA,
       * SECURITY INVOKER (aislamiento por RLS), reciben el rango como fechas
       * locales `p_from`/`p_to` (ISO `YYYY-MM-DD`, `p_to` inclusivo) y devuelven
       * importes en CÉNTIMOS. Ver `@/lib/metrics` para los envoltorios tipados.
       */

      /** KPIs de facturación del periodo (una fila). */
      salon_sales_summary: {
        Args: { p_salon_id: string; p_from: string; p_to: string };
        Returns: {
          sales_count: number;
          customers_count: number;
          gross_revenue_cents: number;
          taxable_base_cents: number;
          discount_cents: number;
          tax_cents: number;
          avg_ticket_cents: number;
        }[];
      };

      /** Facturación / nº de tickets / ticket medio en el tiempo. */
      salon_revenue_timeseries: {
        Args: {
          p_salon_id: string;
          p_from: string;
          p_to: string;
          p_granularity?: string;
        };
        Returns: {
          bucket_start: string;
          sales_count: number;
          revenue_cents: number;
          avg_ticket_cents: number;
        }[];
      };

      /** Ingresos por sede. */
      salon_revenue_by_location: {
        Args: { p_salon_id: string; p_from: string; p_to: string };
        Returns: {
          location_id: string | null;
          location_name: string;
          sales_count: number;
          revenue_cents: number;
        }[];
      };

      /** Ingresos por profesional (ranking). */
      salon_revenue_by_professional: {
        Args: {
          p_salon_id: string;
          p_from: string;
          p_to: string;
          p_limit?: number;
        };
        Returns: {
          professional_id: string | null;
          professional_name: string;
          sales_count: number;
          revenue_cents: number;
        }[];
      };

      /** Top servicios / productos por ingresos. */
      salon_top_items: {
        Args: {
          p_salon_id: string;
          p_from: string;
          p_to: string;
          p_item_kind?: string | null;
          p_limit?: number;
        };
        Returns: {
          item_kind: PosSaleLineItemKind;
          item_id: string | null;
          name: string;
          quantity: number;
          revenue_cents: number;
          lines_count: number;
        }[];
      };

      /** Distribución por método de pago. */
      salon_payment_method_distribution: {
        Args: { p_salon_id: string; p_from: string; p_to: string };
        Returns: {
          method: PosPaymentMethod;
          payments_count: number;
          amount_cents: number;
        }[];
      };

      /** Clientes nuevos vs recurrentes (una fila). */
      salon_new_vs_returning_customers: {
        Args: { p_salon_id: string; p_from: string; p_to: string };
        Returns: {
          new_customers: number;
          returning_customers: number;
          anonymous_sales: number;
          new_revenue_cents: number;
          returning_revenue_cents: number;
          anonymous_revenue_cents: number;
        }[];
      };

      /** Ocupación de agenda (reservado / capacidad; una fila). */
      salon_agenda_occupancy: {
        Args: {
          p_salon_id: string;
          p_from: string;
          p_to: string;
          p_location_id?: string | null;
        };
        Returns: {
          capacity_minutes: number;
          booked_minutes: number;
          booked_appointments: number;
          occupancy_rate: number;
        }[];
      };
    };
    Enums: {
      member_role: MemberRole;
      appointment_status: AppointmentStatus;
      reminder_type: ReminderType;
      reminder_status: ReminderStatus;
      pos_sale_status: PosSaleStatus;
      pos_payment_method: PosPaymentMethod;
      pos_session_status: PosSessionStatus;
      pos_invoice_type: PosInvoiceType;
      points_movement_type: PointsMovementType;
      coupon_status: CouponStatus;
      reward_status: RewardStatus;
      salon_feature: SalonFeature;
    };
    CompositeTypes: Record<never, never>;
  };
}

// Helpers de acceso tipado ------------------------------------------------------

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

// Alias de dominio (evitan repetir Tables<"..."> por toda la app)
export type Salon = Tables<"salons">;
export type SalonMember = Tables<"salon_members">;
export type Location = Tables<"locations">;
export type Service = Tables<"services">;
export type Professional = Tables<"professionals">;
export type Customer = Tables<"customers">;
export type Product = Tables<"products">;
export type Appointment = Tables<"appointments">;
export type Visit = Tables<"visits">;
export type ProfessionalSchedule = Tables<"professional_schedules">;
export type ScheduleException = Tables<"schedule_exceptions">;
export type AppointmentHistoryEntry = Tables<"appointment_history">;
export type CustomerHistoryEntry = Tables<"customer_history">;
export type WhatsappReminderQueueEntry = Tables<"whatsapp_reminder_queue">;
// TPV (Terminal Punto de Venta)
export type PosPaymentMethodRow = Tables<"pos_payment_methods">;
export type PosSession = Tables<"pos_sessions">;
export type PosSale = Tables<"pos_sales">;
export type PosSaleLine = Tables<"pos_sale_lines">;
export type PosPayment = Tables<"pos_payments">;
export type PosInvoice = Tables<"pos_invoices">;
// Fidelización (add-on premium)
export type LoyaltyAccount = Tables<"loyalty_accounts">;
export type PointsMovement = Tables<"points_movements">;
export type WelcomeCoupon = Tables<"welcome_coupons">;
export type Reward = Tables<"rewards">;
// Entitlements (productización)
export type SalonFeatureRow = Tables<"salon_features">;
// Marca (white-label) — logo + colores por salón (1:1 con salons)
export type SalonBranding = Tables<"salon_branding">;
// Seguridad — claves de API por salón (auth de servicio, emisión solo HAT3X)
export type ServiceApiKey = Tables<"service_api_keys">;
export type ServiceApiKeyInsert = TablesInsert<"service_api_keys">;

// Phase helpers -----------------------------------------------------------------

/** Tiempo relativo (en minutos desde el inicio de la cita) para una fase del servicio. */
export interface ServicePhaseRange {
  label: "application" | "exposure" | "post_exposure";
  /** Minutos desde el inicio de la cita en que comienza la fase. */
  startMin: number;
  /** Minutos desde el inicio de la cita en que termina la fase. */
  endMin: number;
  /** Duración de la fase en minutos. */
  durationMin: number;
}

/** Los tres tramos de tiempo relativos de un servicio con fases. */
export interface ServicePhases {
  application: ServicePhaseRange;
  exposure: ServicePhaseRange;
  postExposure: ServicePhaseRange;
  /** Duración total (suma de las tres fases), en minutos. */
  totalMin: number;
}

/**
 * Devuelve los tres tramos de tiempo como rangos relativos (en minutos desde
 * el inicio de la cita) a partir de las columnas de fase de un servicio.
 *
 * Las fases se encadenan sin solapamiento:
 *   [0, application_min) → [application_min, application_min+exposure_min) → …
 */
export function getServicePhases(service: Service): ServicePhases {
  const { application_min, exposure_min, post_exposure_min } = service;

  const appEnd = application_min;
  const expEnd = appEnd + exposure_min;
  const postEnd = expEnd + post_exposure_min;

  return {
    application: {
      label: "application",
      startMin: 0,
      endMin: appEnd,
      durationMin: application_min,
    },
    exposure: {
      label: "exposure",
      startMin: appEnd,
      endMin: expEnd,
      durationMin: exposure_min,
    },
    postExposure: {
      label: "post_exposure",
      startMin: expEnd,
      endMin: postEnd,
      durationMin: post_exposure_min,
    },
    totalMin: postEnd,
  };
}

/** Fases de una cita concreta expresadas como timestamps absolutos (Date). */
export interface AppointmentPhases {
  application: { start: Date; end: Date };
  exposure: { start: Date; end: Date };
  postExposure: { start: Date; end: Date };
}

/**
 * Proyecta los rangos relativos de `getServicePhases` sobre el `starts_at`
 * de una cita, devolviendo timestamps absolutos para cada fase.
 */
export function getAppointmentPhases(
  appointment: Pick<Appointment, "starts_at">,
  service: Service,
): AppointmentPhases {
  const base = new Date(appointment.starts_at).getTime();
  const ms = 60_000;
  const { application, exposure, postExposure } = getServicePhases(service);

  return {
    application: {
      start: new Date(base + application.startMin * ms),
      end: new Date(base + application.endMin * ms),
    },
    exposure: {
      start: new Date(base + exposure.startMin * ms),
      end: new Date(base + exposure.endMin * ms),
    },
    postExposure: {
      start: new Date(base + postExposure.startMin * ms),
      end: new Date(base + postExposure.endMin * ms),
    },
  };
}
