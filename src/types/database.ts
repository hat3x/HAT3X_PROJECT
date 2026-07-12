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
          duration_minutes: number;
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
          duration_minutes: number;
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
          duration_minutes?: number;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      member_role: MemberRole;
      appointment_status: AppointmentStatus;
    };
    CompositeTypes: Record<string, never>;
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
export type Service = Tables<"services">;
export type Professional = Tables<"professionals">;
export type Customer = Tables<"customers">;
export type Appointment = Tables<"appointments">;
export type Visit = Tables<"visits">;
export type AppointmentHistoryEntry = Tables<"appointment_history">;
export type CustomerHistoryEntry = Tables<"customer_history">;
