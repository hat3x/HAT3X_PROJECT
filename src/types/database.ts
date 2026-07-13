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
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      member_role: MemberRole;
      appointment_status: AppointmentStatus;
      reminder_type: ReminderType;
      reminder_status: ReminderStatus;
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
export type Appointment = Tables<"appointments">;
export type Visit = Tables<"visits">;
export type ProfessionalSchedule = Tables<"professional_schedules">;
export type ScheduleException = Tables<"schedule_exceptions">;
export type AppointmentHistoryEntry = Tables<"appointment_history">;
export type CustomerHistoryEntry = Tables<"customer_history">;
export type WhatsappReminderQueueEntry = Tables<"whatsapp_reminder_queue">;

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
