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

/** Tipo de hallazgo/procedimiento dental (espejo del enum public.dental_finding_type). */
export type DentalFindingType =
  | "sano"
  | "caries"
  | "obturacion"
  | "endodoncia"
  | "corona"
  | "implante"
  | "extraccion"
  | "puente"
  | "fractura"
  | "erosion"
  | "sellador"
  | "blanqueamiento"
  | "nota";

/** Estado visual del diente (espejo del enum public.dental_tooth_state y ToothState de color.ts). */
export type DentalToothState =
  | "sano"
  | "pendiente"
  | "hecho"
  | "en_curso"
  | "ausente"
  | "corona"
  | "implante";

/** Estado del plan de tratamiento (espejo del enum public.treatment_plan_status). */
export type TreatmentPlanStatus =
  | "draft"
  | "proposed"
  | "accepted"
  | "in_progress"
  | "completed"
  | "cancelled";

/** Estado de una línea del plan de tratamiento (espejo del enum public.plan_item_state). */
export type PlanItemState =
  | "propuesto"
  | "aceptado"
  | "en_curso"
  | "realizado"
  | "rechazado"
  | "anulado";

/**
 * Tipo de movimiento de stock (espejo del enum public.stock_movement_kind).
 * Migración 20260801120000_stock_inventory. `entrada`/`salida` = flujo normal;
 * `ajuste` = corrección manual (fija el total); `merma` = pérdida/rotura.
 */
export type StockMovementKind = "entrada" | "salida" | "ajuste" | "merma";

/**
 * Estado del pedido de mostrador (espejo del enum public.order_status).
 * Migración 20260810100000_restauracion_orders.
 */
export type OrderStatus = "abierta" | "cobrada" | "cerrada" | "anulada";

/** Estado de una línea de pedido (espejo del enum public.order_item_status). */
export type OrderItemStatus =
  | "pendiente"
  | "enviado"
  | "preparando"
  | "listo"
  | "entregado"
  | "anulado";

/**
 * Forma de la mesa en el plano de sala (espejo del enum public.table_shape).
 * Migración 20260810130000_restauracion_sala.
 */
export type TableShape = "round" | "square";

/** Estado de la mesa (espejo del enum public.table_status). */
export type TableStatus = "libre" | "ocupada" | "cuenta_pedida" | "por_limpiar";

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

/**
 * Sector del tenant. Espejo TS del enum `public.salon_sector` (migración
 * 20260731100000_salon_sector). Lo fija HAT3X al alta; determina
 * nav/terminologia/modulos. Default `peluqueria` (back-compat).
 */
export type SalonSector = "peluqueria" | "odontologia" | "restauracion";

/**
 * Alérgenos de declaración obligatoria (Reglamento UE 1169/2011). Espejo TS
 * del enum `public.allergen` (migración 20260809120000_restauracion_menu_base).
 */
export type Allergen =
  | "gluten" | "crustaceos" | "huevos" | "pescado" | "cacahuetes" | "soja" | "lacteos"
  | "frutos_cascara" | "apio" | "mostaza" | "sesamo" | "sulfitos" | "altramuces" | "moluscos";

/** Tipo de consentimiento informado (espejo del enum public.consent_type). */
export type ConsentType =
  | "general"
  | "endodoncia"
  | "exodoncia"
  | "implante"
  | "ortodoncia"
  | "anestesia"
  | "periodoncia"
  | "blanqueamiento"
  | "rgpd";

/** Estado de un consentimiento informado (espejo del enum public.consent_status). */
export type ConsentStatus = "pending" | "signed" | "revoked";

/** Modalidad de una imagen/radiografía clínica (espejo del enum public.image_modality). */
export type ImageModality =
  | "periapical"
  | "bitewing"
  | "panoramic"
  | "cbct"
  | "cefalometrica"
  | "foto_intraoral"
  | "scan_stl";

/**
 * Estado de una receta/prescripción (espejo del enum public.prescription_status).
 * Borrador → emitida → revocada; INMUTABLE tras emitir (trigger
 * `prescription_guard`, migración 20260801140000_prescriptions.sql).
 */
export type PrescriptionStatus = "draft" | "issued" | "revoked";

/** Estado del plan de pago de ortodoncia (espejo del enum public.ortho_plan_status). */
export type OrthoPlanStatus = "activo" | "completado" | "cancelado";

/** Estado de una cuota del plan de pago de ortodoncia (espejo del enum public.ortho_installment_status). */
export type OrthoInstallmentStatus = "pendiente" | "pagada";

export interface Database {
  public: {
    Tables: {
      time_clock: {
        Row: {
          id: string;
          salon_id: string;
          user_id: string | null;
          clock_in: string;
          clock_out: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          user_id?: string | null;
          clock_in?: string;
          clock_out?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          user_id?: string | null;
          clock_in?: string;
          clock_out?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      clinical_history: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          occurred_on: string;
          kind: string | null;
          category: "clinica" | "comunicacion" | "nota" | "otro";
          note: string | null;
          fdi_tooth: number | null;
          amount_cents: number | null;
          done: boolean;
          professional: string | null;
          source_ref: string | null;
          data: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          occurred_on: string;
          kind?: string | null;
          category?: "clinica" | "comunicacion" | "nota" | "otro";
          note?: string | null;
          fdi_tooth?: number | null;
          amount_cents?: number | null;
          done?: boolean;
          professional?: string | null;
          source_ref?: string | null;
          data?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          occurred_on?: string;
          kind?: string | null;
          category?: "clinica" | "comunicacion" | "nota" | "otro";
          note?: string | null;
          fdi_tooth?: number | null;
          amount_cents?: number | null;
          done?: boolean;
          professional?: string | null;
          source_ref?: string | null;
          data?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      billing_history: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string | null;
          issued_on: string;
          series: string | null;
          number: number | null;
          full_number: string | null;
          total_cents: number;
          tax_cents: number | null;
          paid: boolean;
          paid_on: string | null;
          payment_method: string | null;
          status: string | null;
          concept: string | null;
          source_ref: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id?: string | null;
          issued_on: string;
          series?: string | null;
          number?: number | null;
          full_number?: string | null;
          total_cents?: number;
          tax_cents?: number | null;
          paid?: boolean;
          paid_on?: string | null;
          payment_method?: string | null;
          status?: string | null;
          concept?: string | null;
          source_ref?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string | null;
          issued_on?: string;
          series?: string | null;
          number?: number | null;
          full_number?: string | null;
          total_cents?: number;
          tax_cents?: number | null;
          paid?: boolean;
          paid_on?: string | null;
          payment_method?: string | null;
          status?: string | null;
          concept?: string | null;
          source_ref?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
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
          sector: SalonSector;
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
          sector?: SalonSector;
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
          sector?: SalonSector;
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
      // Categorías de la carta (restauración) — migración
      // 20260809120000_restauracion_menu_base. Clave compuesta
      // menu_categories_id_salon_key (id, salon_id) para permitir FK
      // compuestas de dominio desde products.category_id.
      menu_categories: {
        Row: {
          id: string;
          salon_id: string;
          name: string;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          name?: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_categories_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      // Estaciones de producción (cocina, barra, plancha, ...) — migración
      // 20260809120000_restauracion_menu_base. Clave compuesta
      // stations_id_salon_key (id, salon_id) para permitir FK compuestas de
      // dominio desde products.station_id.
      stations: {
        Row: {
          id: string;
          salon_id: string;
          name: string;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          name?: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stations_salon_id_fkey";
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
          // min_stock/unit — migración 20260801120000_stock_inventory: control
          // de stock/inventario de material (peluquería + odontología, sin gate
          // de sector). min_stock = umbral de reposición (stock <= min_stock ⇒
          // "Bajo mínimo"); unit = unidad de medida a mostrar (p. ej. "unidad",
          // "ml", "ampolla").
          min_stock: number;
          unit: string;
          active: boolean;
          created_at: string;
          updated_at: string;
          // Carta (restauración) — migración
          // 20260809120000_restauracion_menu_base. category_id/station_id son
          // FKs compuestas (id, salon_id) hacia menu_categories/stations
          // (products_category_id_fkey/products_station_id_fkey).
          category_id: string | null;
          station_id: string | null;
          is_combo: boolean;
          image_url: string | null;
          allergens: Allergen[];
          available_channels: string[];
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
          min_stock?: number; // default 0
          unit?: string; // default 'unidad'
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          category_id?: string | null;
          station_id?: string | null;
          is_combo?: boolean;
          image_url?: string | null;
          allergens?: Allergen[];
          available_channels?: string[];
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
          min_stock?: number;
          unit?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          category_id?: string | null;
          station_id?: string | null;
          is_combo?: boolean;
          image_url?: string | null;
          allergens?: Allergen[];
          available_channels?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "products_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "menu_categories";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "products_station_id_fkey";
            columns: ["station_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "stations";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      // Grupos de modificadores de la carta (restauración) — migración
      // 20260809121000_restauracion_modifiers. min_select/max_select acotan
      // cuántas opciones puede elegir el cliente dentro del grupo (constraint
      // modifier_groups_min_le_max: min_select <= max_select). Clave compuesta
      // modifier_groups_id_salon_key (id, salon_id) para permitir FKs
      // compuestas de dominio desde modifiers.group_id y
      // product_modifier_groups.group_id.
      modifier_groups: {
        Row: {
          id: string;
          salon_id: string;
          name: string;
          min_select: number;
          max_select: number;
          required: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          min_select?: number;
          max_select?: number;
          required?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          name?: string;
          min_select?: number;
          max_select?: number;
          required?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "modifier_groups_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      // Opciones de un grupo de modificadores — migración
      // 20260809121000_restauracion_modifiers. price_delta_cents puede ser
      // negativo (p. ej. un descuento por elegir "sin queso"). group_id es FK
      // compuesta (id, salon_id) hacia modifier_groups
      // (modifiers_group_id_fkey).
      modifiers: {
        Row: {
          id: string;
          salon_id: string;
          group_id: string;
          name: string;
          price_delta_cents: number;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          group_id: string;
          name: string;
          price_delta_cents?: number;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          group_id?: string;
          name?: string;
          price_delta_cents?: number;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "modifiers_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "modifiers_group_id_fkey";
            columns: ["group_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "modifier_groups";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      // Asignación de grupos de modificadores a productos — migración
      // 20260809121000_restauracion_modifiers. product_id/group_id son FKs
      // compuestas (id, salon_id) hacia products/modifier_groups
      // (product_modifier_groups_product_fkey/product_modifier_groups_group_fkey).
      // unique (salon_id, product_id, group_id): un grupo no puede asignarse
      // dos veces al mismo producto.
      product_modifier_groups: {
        Row: {
          id: string;
          salon_id: string;
          product_id: string;
          group_id: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          salon_id: string;
          product_id: string;
          group_id: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          salon_id?: string;
          product_id?: string;
          group_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_modifier_groups_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_modifier_groups_product_fkey";
            columns: ["product_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "product_modifier_groups_group_fkey";
            columns: ["group_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "modifier_groups";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      // Piezas de un producto combo (restauración) — migración
      // 20260809122000_restauracion_combos. combo_product_id/component_product_id
      // son FKs compuestas (id, salon_id) hacia products (el combo en sí y cada
      // pieza que lo compone: combo_components_combo_fkey/
      // combo_components_component_fkey). station_id_override permite el ruteo
      // por pieza (p. ej. comida→cocina, bebida→barra) cuando difiere de la
      // estación por defecto del producto pieza; FK compuesta opcional hacia
      // stations (combo_components_station_fkey, on delete set null). qty > 0
      // (combo_components_id_salon_key: (id, salon_id) unique para permitir
      // FKs compuestas de dominio desde otras tablas).
      combo_components: {
        Row: {
          id: string;
          salon_id: string;
          combo_product_id: string;
          component_product_id: string;
          qty: number;
          station_id_override: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          combo_product_id: string;
          component_product_id: string;
          qty?: number;
          station_id_override?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          combo_product_id?: string;
          component_product_id?: string;
          qty?: number;
          station_id_override?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "combo_components_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "combo_components_combo_fkey";
            columns: ["combo_product_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "combo_components_component_fkey";
            columns: ["component_product_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "combo_components_station_fkey";
            columns: ["station_id_override", "salon_id"];
            isOneToOne: false;
            referencedRelation: "stations";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      // Pedidos de mostrador (restauración), append-only — migración
      // 20260810100000_restauracion_orders. `id` se genera EN CLIENTE
      // (offline-ready): sin default en BD → REQUERIDO en Insert.
      // `order_number` es correlativo por salón (trigger app.set_order_number,
      // omitir en Insert). session_id es FK compuesta opcional hacia
      // pos_sessions (orders_session_id_fkey, on delete set null).
      // idempotency_key es único por salón (orders_idempotency_key) para que
      // reintentos del cliente no dupliquen el pedido. Clave de apoyo
      // orders_id_salon_key (id, salon_id) para las FKs compuestas de
      // order_items y pos_sales.order_id.
      // dining_table_id/covers — migración 20260810130000_restauracion_sala:
      // enlace opcional con la mesa (channel='mesa'); dining_table_id es FK
      // compuesta hacia dining_tables (orders_dining_table_id_fkey, on delete
      // set null). covers = número de comensales.
      orders: {
        Row: {
          id: string;
          salon_id: string;
          session_id: string | null;
          order_number: number | null; // bigint — correlativo por salón (trigger)
          channel: string;
          status: OrderStatus;
          label: string | null;
          idempotency_key: string | null;
          dining_table_id: string | null;
          covers: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string; // sin default en BD: generado en cliente
          salon_id: string;
          session_id?: string | null;
          // order_number lo pone el trigger app.set_order_number: omitir
          channel?: string;
          status?: OrderStatus;
          label?: string | null;
          idempotency_key?: string | null;
          dining_table_id?: string | null;
          covers?: number | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          session_id?: string | null;
          order_number?: number | null;
          channel?: string;
          status?: OrderStatus;
          label?: string | null;
          idempotency_key?: string | null;
          dining_table_id?: string | null;
          covers?: number | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_session_id_fkey";
            columns: ["session_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "pos_sessions";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "orders_dining_table_id_fkey";
            columns: ["dining_table_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "dining_tables";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      // Líneas de pedido (restauración), append-only — migración
      // 20260810100000_restauracion_orders. `id` se genera EN CLIENTE: sin
      // default en BD → REQUERIDO en Insert. `void_of_item_id` !== null marca
      // una fila como anulación de otra (append-only: nunca se hace UPDATE del
      // qty/precio, se inserta una anulación). `modifiers_snapshot` guarda los
      // modificadores elegidos en el momento del pedido (el catálogo puede
      // cambiar). station_id es FK compuesta opcional hacia stations
      // (order_items_station_id_fkey, on delete set null) para el ruteo a
      // cocina/barra. Clave de apoyo order_items_id_salon_key (id, salon_id).
      order_items: {
        Row: {
          id: string;
          salon_id: string;
          order_id: string;
          product_id: string;
          qty: number;
          unit_price_cents: number;
          vat_rate: number;
          station_id: string | null;
          status: OrderItemStatus;
          combo_group: string | null;
          modifiers_snapshot: Json;
          void_of_item_id: string | null;
          void_reason: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string; // sin default en BD: generado en cliente
          salon_id: string;
          order_id: string;
          product_id: string;
          qty?: number;
          unit_price_cents?: number;
          vat_rate?: number;
          station_id?: string | null;
          status?: OrderItemStatus;
          combo_group?: string | null;
          modifiers_snapshot?: Json;
          void_of_item_id?: string | null;
          void_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          order_id?: string;
          product_id?: string;
          qty?: number;
          unit_price_cents?: number;
          vat_rate?: number;
          station_id?: string | null;
          status?: OrderItemStatus;
          combo_group?: string | null;
          modifiers_snapshot?: Json;
          void_of_item_id?: string | null;
          void_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "order_items_station_id_fkey";
            columns: ["station_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "stations";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      // Zonas de sala (restauración) — migración
      // 20260810130000_restauracion_sala. Clave compuesta
      // dining_zones_id_salon_key (id, salon_id) para permitir la FK compuesta
      // de dominio desde dining_tables.zone_id.
      dining_zones: {
        Row: {
          id: string;
          salon_id: string;
          name: string;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          name?: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dining_zones_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
        ];
      };
      // Mesas del plano de sala (restauración) — migración
      // 20260810130000_restauracion_sala. zone_id es FK compuesta hacia
      // dining_zones (dining_tables_zone_fkey, on delete cascade).
      // capacity_max >= capacity_min (constraint dining_tables_capacity_order).
      // pos_x/pos_y son coordenadas del plano visual (porcentaje 0-100). Clave
      // de apoyo dining_tables_id_salon_key (id, salon_id) para la FK compuesta
      // de dominio desde orders.dining_table_id.
      dining_tables: {
        Row: {
          id: string;
          salon_id: string;
          zone_id: string;
          name: string;
          capacity_min: number;
          capacity_max: number;
          pos_x: number;
          pos_y: number;
          shape: TableShape;
          status: TableStatus;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          zone_id: string;
          name: string;
          capacity_min?: number;
          capacity_max?: number;
          pos_x?: number;
          pos_y?: number;
          shape?: TableShape;
          status?: TableStatus;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          zone_id?: string;
          name?: string;
          capacity_min?: number;
          capacity_max?: number;
          pos_x?: number;
          pos_y?: number;
          shape?: TableShape;
          status?: TableStatus;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dining_tables_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dining_tables_zone_fkey";
            columns: ["zone_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "dining_zones";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      // Movimientos de stock (libro de inventario) — migración
      // 20260801120000_stock_inventory. `quantity` es el DELTA CON SIGNO ya
      // aplicado al stock resultante (no la magnitud introducida por el
      // usuario); ver `@/lib/stock` para la lógica pura de cálculo
      // (`applyMovement`/`movementDelta`) y `products/stock-actions.ts` para la
      // Server Action que persiste el movimiento Y actualiza `products.stock`.
      // Lote/caducidad viajan en las ENTRADAS (trazabilidad de lotes).
      stock_movement: {
        Row: {
          id: string;
          salon_id: string;
          product_id: string;
          kind: StockMovementKind;
          quantity: number; // delta con signo, ≠0 (check de BD)
          resulting_stock: number | null; // foto del stock tras el movimiento
          lot: string | null;
          expiry: string | null; // fecha YYYY-MM-DD
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          product_id: string;
          kind: StockMovementKind;
          quantity: number;
          resulting_stock?: number | null;
          lot?: string | null;
          expiry?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          product_id?: string;
          kind?: StockMovementKind;
          quantity?: number;
          resulting_stock?: number | null;
          lot?: string | null;
          expiry?: string | null;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movement_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movement_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      // Escandallo (BOM) de materiales por tratamiento — Fase 2 del inventario
      // (migración ya aplicada). Vincula un servicio con los productos que
      // consume y en qué cantidad (por 1x del servicio); UNIQUE(service_id,
      // product_id) evita duplicar la misma línea. El auto-descuento de stock
      // al marcar un `plan_item` como 'realizado' vive en
      // `app/(dashboard)/planes/actions.ts` (`transitionPlanItem`), que lee
      // esta tabla y reutiliza `@/lib/stock` (applyMovement/movementDelta)
      // para registrar las salidas correspondientes.
      service_material: {
        Row: {
          id: string;
          salon_id: string;
          service_id: string;
          product_id: string;
          quantity: number; // > 0 (check de BD); unidades de producto por 1x del servicio
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          service_id: string;
          product_id: string;
          quantity?: number; // default 1
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          service_id?: string;
          product_id?: string;
          quantity?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_material_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_material_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_material_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
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
      visit_notes: {
        Row: {
          visit_id: string;
          salon_id: string;
          content: string;
          data: Json;
          signed: boolean;
          signed_at: string | null;
          signed_by: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          visit_id: string;
          salon_id: string;
          content?: string;
          data?: Json;
          signed?: boolean;
          signed_at?: string | null;
          signed_by?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          visit_id?: string;
          salon_id?: string;
          content?: string;
          data?: Json;
          signed?: boolean;
          signed_at?: string | null;
          signed_by?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visit_notes_visit_salon_fkey";
            columns: ["visit_id", "salon_id"];
            isOneToOne: true;
            referencedRelation: "visits";
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
      salon_opening_hours: {
        Row: {
          id: string;
          salon_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          weekday?: number;
          start_time?: string;
          end_time?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "salon_opening_hours_salon_id_fkey";
            columns: ["salon_id"];
            isOneToOne: false;
            referencedRelation: "salons";
            referencedColumns: ["id"];
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
          // Enlace fiscal al pedido de origen (restauración) — migración
          // 20260810100000_restauracion_orders. FK compuesta
          // pos_sales_order_id_fkey (order_id, salon_id) → orders (id, salon_id).
          order_id: string | null;
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
          order_id?: string | null;
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
          order_id?: string | null;
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
          {
            foreignKeyName: "pos_sales_order_id_fkey";
            columns: ["order_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "orders";
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
          created_at: string; // marca temporal de creación del registro
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
          created_at?: string;
        };
        // Verifactu retirado: la factura ya es editable/borrable (RLS UPDATE/DELETE).
        Update: {
          id?: string;
          salon_id?: string;
          sale_id?: string | null;
          invoice_type?: PosInvoiceType;
          series?: string;
          sequential_number?: number;
          issued_at?: string;
          currency?: string;
          tax_breakdown?: Json;
          taxable_base_cents?: number;
          tax_cents?: number;
          total_cents?: number;
          issuer_data?: Json | null;
          recipient_data?: Json | null;
          created_at?: string;
        };
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
      // Ficha clínica del cliente: 1:1 con customers (customer_id es PK y parte de la
      // FK compuesta). Datos de categoría especial RGPD Art. 9 (alergias,
      // contraindicaciones, medicaciones). consent_signed_at es requisito legal antes
      // de mostrar datos sensibles. Sector-agnóstica: campos comunes + jsonb 'data'
      // para extensión específica de sector. Ver migración 20260731110000_clinical_records.
      clinical_records: {
        Row: {
          customer_id: string;
          salon_id: string;
          allergies: string[];
          contraindications: string[];
          skin_hair_type: string | null;
          medications: string[];
          medical_notes: string | null;
          /** Extensión sector-específica. Tipado en la capa de app por sector. */
          data: Json;
          /** RGPD Art. 9: timestamp de consentimiento. NULL = no obtenido. */
          consent_signed_at: string | null;
          consent_version: string | null;
          last_updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          customer_id: string;
          salon_id: string;
          allergies?: string[];
          contraindications?: string[];
          skin_hair_type?: string | null;
          medications?: string[];
          medical_notes?: string | null;
          data?: Json;
          consent_signed_at?: string | null;
          consent_version?: string | null;
          last_updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          customer_id?: string;
          salon_id?: string;
          allergies?: string[];
          contraindications?: string[];
          skin_hair_type?: string | null;
          medications?: string[];
          medical_notes?: string | null;
          data?: Json;
          consent_signed_at?: string | null;
          consent_version?: string | null;
          last_updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinical_records_customer_salon_fkey";
            columns: ["customer_id", "salon_id"];
            isOneToOne: true;
            referencedRelation: "customers";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "clinical_records_last_updated_by_fkey";
            columns: ["last_updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
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
      // Historial event-sourced de hallazgos del odontograma. Tabla append-only:
      // cada fila = evento clínico inmutable. Estado actual por diente = evento
      // más reciente. FK compuesta (clinical_record_id, salon_id) → clinical_records.
      // Ver migración 20260731120000_odontogram_findings.
      odontogram_findings: {
        Row: {
          id: string;
          clinical_record_id: string;
          salon_id: string;
          fdi_tooth: number;
          surfaces: string[];
          finding_type: DentalFindingType;
          tooth_state: DentalToothState;
          notes: string | null;
          recorded_by: string | null;
          recorded_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          clinical_record_id: string;
          salon_id: string;
          fdi_tooth: number;
          surfaces?: string[];
          finding_type: DentalFindingType;
          tooth_state: DentalToothState;
          notes?: string | null;
          recorded_by?: string | null;
          recorded_at?: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "odontogram_findings_record_salon_fkey";
            columns: ["clinical_record_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "clinical_records";
            referencedColumns: ["customer_id", "salon_id"];
          },
        ];
      };
      // Periodontograma — cabecera de la exploración periodontal (1:N desde
      // clinical_records vía customer_id+salon_id). Inamovible cuando signed = TRUE
      // (trigger trg_perio_exam_immutable). Ver migración 20260731140000_perio_exam.
      perio_exam: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          examiner_id: string | null;
          notes: string | null;
          signed: boolean;
          signed_at: string | null;
          signed_by: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          examiner_id?: string | null;
          notes?: string | null;
          signed?: boolean;
          signed_at?: string | null;
          signed_by?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          examiner_id?: string | null;
          notes?: string | null;
          signed?: boolean;
          signed_at?: string | null;
          signed_by?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "perio_exam_customer_salon_fkey";
            columns: ["customer_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "clinical_records";
            referencedColumns: ["customer_id", "salon_id"];
          },
        ];
      };
      // Periodontograma — datos por diente (1:N desde perio_exam vía exam_id+salon_id):
      // movilidad (Miller 1985), furcación (Hamp 1975), placa. Un diente por examen
      // (UNIQUE exam_id+fdi_tooth). Ver migración 20260731140000_perio_exam.
      perio_tooth: {
        Row: {
          id: string;
          exam_id: string;
          salon_id: string;
          fdi_tooth: number;
          mobility: number;
          furcation: number;
          plaque: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          exam_id: string;
          salon_id: string;
          fdi_tooth: number;
          mobility?: number;
          furcation?: number;
          plaque?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          exam_id?: string;
          salon_id?: string;
          fdi_tooth?: number;
          mobility?: number;
          furcation?: number;
          plaque?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "perio_tooth_exam_salon_fkey";
            columns: ["exam_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "perio_exam";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      // Periodontograma — mediciones por sitio de sondaje (1:N desde perio_tooth vía
      // tooth_id+salon_id, 6 sitios/diente). cal_mm es GENERATED ALWAYS AS
      // (pd_mm - gingival_margin_mm) STORED — nunca se inserta/actualiza directamente.
      // Ver migración 20260731140000_perio_exam.
      perio_site: {
        Row: {
          id: string;
          tooth_id: string;
          salon_id: string;
          site: number;
          pd_mm: number;
          gingival_margin_mm: number;
          cal_mm: number;
          bop: boolean;
          suppuration: boolean;
          plaque: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          tooth_id: string;
          salon_id: string;
          site: number;
          pd_mm: number;
          gingival_margin_mm?: number;
          bop?: boolean;
          suppuration?: boolean;
          plaque?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          tooth_id?: string;
          salon_id?: string;
          site?: number;
          pd_mm?: number;
          gingival_margin_mm?: number;
          bop?: boolean;
          suppuration?: boolean;
          plaque?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "perio_site_tooth_salon_fkey";
            columns: ["tooth_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "perio_tooth";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      // Planes de tratamiento / presupuestos (odontología) — cabecera del plan
      // (1:N desde clinical_records vía customer_id+salon_id). El estado es un
      // roll-up gestionado por la app (updatePlanStatus), no derivado en BD.
      // Ver migración 20260801100000_treatment_plans.sql.
      treatment_plan: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          status: TreatmentPlanStatus;
          currency: string;
          notes: string | null;
          insurer_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          status?: TreatmentPlanStatus;
          currency?: string;
          notes?: string | null;
          insurer_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          status?: TreatmentPlanStatus;
          currency?: string;
          notes?: string | null;
          insurer_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "treatment_plan_customer_fk";
            columns: ["customer_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "clinical_records";
            referencedColumns: ["customer_id", "salon_id"];
          },
          {
            foreignKeyName: "treatment_plan_insurer_id_fkey";
            columns: ["insurer_id"];
            isOneToOne: false;
            referencedRelation: "insurer";
            referencedColumns: ["id"];
          },
        ];
      };
      // Ortodoncia — log de progreso por visita (Fase 1 del módulo de
      // ortodoncia). La ficha y el tratamiento viven en
      // clinical_records.data.ortho (JSONB); esta tabla guarda una entrada
      // por visita. Ver migración 20260811120000_ortho_visit.sql.
      ortho_visit: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          appointment_id: string | null;
          visit_date: string;
          actions: Json;
          notes: string | null;
          next_step: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          appointment_id?: string | null;
          visit_date?: string;
          actions?: Json;
          notes?: string | null;
          next_step?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          appointment_id?: string | null;
          visit_date?: string;
          actions?: Json;
          notes?: string | null;
          next_step?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      // Ortodoncia — plan de pago (Fase 2 económico). Presupuesto cerrado a
      // plazos con calendario de cuotas (ortho_installment). Solo un plan
      // "activo" por paciente (índice único parcial). Creación atómica vía
      // RPC create_ortho_payment_plan. Ver migración
      // 20260811130000_ortho_payments.sql.
      ortho_payment_plan: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          total_cents: number;
          down_payment_cents: number;
          installment_count: number;
          day_of_month: number;
          start_date: string;
          currency: string;
          status: OrthoPlanStatus;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          total_cents: number;
          down_payment_cents?: number;
          installment_count: number;
          day_of_month: number;
          start_date: string;
          currency?: string;
          status?: OrthoPlanStatus;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          total_cents?: number;
          down_payment_cents?: number;
          installment_count?: number;
          day_of_month?: number;
          start_date?: string;
          currency?: string;
          status?: OrthoPlanStatus;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ortho_payment_plan_customer_fk";
            columns: ["customer_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "clinical_records";
            referencedColumns: ["customer_id", "salon_id"];
          },
        ];
      };
      // Ortodoncia — cuotas del plan de pago (1:N desde ortho_payment_plan vía
      // plan_id+salon_id). `seq` es el nº de cuota (1..installment_count).
      // Ver migración 20260811130000_ortho_payments.sql.
      ortho_installment: {
        Row: {
          id: string;
          salon_id: string;
          plan_id: string;
          customer_id: string;
          seq: number;
          due_date: string;
          amount_cents: number;
          status: OrthoInstallmentStatus;
          paid_at: string | null;
          paid_method: string | null;
          paid_amount_cents: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          plan_id: string;
          customer_id: string;
          seq: number;
          due_date: string;
          amount_cents: number;
          status?: OrthoInstallmentStatus;
          paid_at?: string | null;
          paid_method?: string | null;
          paid_amount_cents?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          plan_id?: string;
          customer_id?: string;
          seq?: number;
          due_date?: string;
          amount_cents?: number;
          status?: OrthoInstallmentStatus;
          paid_at?: string | null;
          paid_method?: string | null;
          paid_amount_cents?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ortho_installment_plan_fk";
            columns: ["plan_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "ortho_payment_plan";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      // Ortodoncia — pedidos a laboratorio (Fase 4). Estado (enviado/recibido/
      // entregado) derivado en la app de sent_at/received_at/delivered_at.
      // Ver migración 20260811140000_lab_order.sql.
      lab_order: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          kind: "modelo" | "retenedor" | "alineadores" | "ortopedia" | "otro";
          lab_name: string | null;
          sent_at: string;
          received_at: string | null;
          delivered_at: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          kind: "modelo" | "retenedor" | "alineadores" | "ortopedia" | "otro";
          lab_name?: string | null;
          sent_at: string;
          received_at?: string | null;
          delivered_at?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          kind?: "modelo" | "retenedor" | "alineadores" | "ortopedia" | "otro";
          lab_name?: string | null;
          sent_at?: string;
          received_at?: string | null;
          delivered_at?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      // Planes de tratamiento — fases (1:N desde treatment_plan vía
      // plan_id+salon_id). Sin updated_at (solo created_at). Ver migración
      // 20260801100000_treatment_plans.sql.
      plan_phase: {
        Row: {
          id: string;
          salon_id: string;
          plan_id: string;
          position: number;
          name: string;
          priority: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          plan_id: string;
          position?: number;
          name: string;
          priority?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          plan_id?: string;
          position?: number;
          name?: string;
          priority?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_phase_plan_fk";
            columns: ["plan_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "treatment_plan";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      // Planes de tratamiento — líneas presupuestadas (1:N desde treatment_plan
      // vía plan_id+salon_id; opcionalmente agrupadas por plan_phase vía
      // phase_id+salon_id). line_total_cents es GENERATED ALWAYS AS (quantity *
      // unit_price_cents - discount_cents) STORED — nunca se inserta/actualiza
      // directamente (omitido de Insert/Update, igual que perio_site.cal_mm).
      // Ver migración 20260801100000_treatment_plans.sql.
      plan_item: {
        Row: {
          id: string;
          salon_id: string;
          plan_id: string;
          phase_id: string | null;
          position: number;
          service_id: string | null;
          description: string | null;
          fdi_code: number | null;
          surfaces: string[];
          quantity: number;
          unit_price_cents: number;
          discount_cents: number;
          tax_rate: number;
          line_total_cents: number;
          state: PlanItemState;
          scheduled_appointment_id: string | null;
          executed_at: string | null;
          executed_by: string | null;
          finding_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          plan_id: string;
          phase_id?: string | null;
          position?: number;
          service_id?: string | null;
          description?: string | null;
          fdi_code?: number | null;
          surfaces?: string[];
          quantity?: number;
          unit_price_cents?: number;
          discount_cents?: number;
          tax_rate?: number;
          // line_total_cents es generada: omitir en Insert
          state?: PlanItemState;
          scheduled_appointment_id?: string | null;
          executed_at?: string | null;
          executed_by?: string | null;
          finding_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          plan_id?: string;
          phase_id?: string | null;
          position?: number;
          service_id?: string | null;
          description?: string | null;
          fdi_code?: number | null;
          surfaces?: string[];
          quantity?: number;
          unit_price_cents?: number;
          discount_cents?: number;
          tax_rate?: number;
          // line_total_cents es generada: omitir en Update
          state?: PlanItemState;
          scheduled_appointment_id?: string | null;
          executed_at?: string | null;
          executed_by?: string | null;
          finding_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_item_plan_fk";
            columns: ["plan_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "treatment_plan";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "plan_item_phase_fk";
            columns: ["phase_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "plan_phase";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      // Mutuas y seguros (odontología) — aseguradoras del salón (insurer), póliza
      // del paciente (customer_insurance, 1:N desde clinical_records vía
      // customer_id+salon_id) y baremo por servicio (insurer_service_price).
      // Ver migración 20260801150000_insurers.sql.
      insurer: {
        Row: {
          id: string;
          salon_id: string;
          name: string;
          phone: string | null;
          email: string | null;
          notes: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          name?: string;
          phone?: string | null;
          email?: string | null;
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customer_insurance: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          insurer_id: string;
          policy_number: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          insurer_id: string;
          policy_number?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          insurer_id?: string;
          policy_number?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_insurance_customer_fk";
            columns: ["customer_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "clinical_records";
            referencedColumns: ["customer_id", "salon_id"];
          },
          {
            foreignKeyName: "customer_insurance_insurer_fk";
            columns: ["insurer_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "insurer";
            referencedColumns: ["id", "salon_id"];
          },
        ];
      };
      // price_cents NO es columna generada (a diferencia de
      // plan_item.line_total_cents): se inserta/actualiza directamente.
      insurer_service_price: {
        Row: {
          id: string;
          salon_id: string;
          insurer_id: string;
          service_id: string;
          price_cents: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          insurer_id: string;
          service_id: string;
          price_cents?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          insurer_id?: string;
          service_id?: string;
          price_cents?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insurer_service_price_insurer_fk";
            columns: ["insurer_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "insurer";
            referencedColumns: ["id", "salon_id"];
          },
          {
            foreignKeyName: "insurer_service_price_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      // Consentimientos informados (odontología) — 1:N desde clinical_records vía
      // customer_id+salon_id. INMUTABLE tras firmar (trigger consents_guard en BD):
      // signed solo puede pasar a revoked; revoked es inmutable; pending se puede
      // editar/borrar. Ver migración 20260801110000_consents_images.sql.
      consents: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          type: ConsentType;
          treatment_plan_id: string | null;
          plan_item_id: string | null;
          fdi_code: number | null;
          title: string;
          body: string | null;
          template_version: string;
          document_uri: string | null;
          status: ConsentStatus;
          signed_at: string | null;
          signed_by_patient: string | null;
          witnessed_by: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          type: ConsentType;
          treatment_plan_id?: string | null;
          plan_item_id?: string | null;
          fdi_code?: number | null;
          title: string;
          body?: string | null;
          template_version?: string; // default 'v1'
          document_uri?: string | null;
          status?: ConsentStatus; // default 'pending'
          signed_at?: string | null;
          signed_by_patient?: string | null;
          witnessed_by?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          type?: ConsentType;
          treatment_plan_id?: string | null;
          plan_item_id?: string | null;
          fdi_code?: number | null;
          title?: string;
          body?: string | null;
          template_version?: string;
          document_uri?: string | null;
          status?: ConsentStatus;
          signed_at?: string | null;
          signed_by_patient?: string | null;
          witnessed_by?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "consents_customer_fk";
            columns: ["customer_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "clinical_records";
            referencedColumns: ["customer_id", "salon_id"];
          },
          {
            foreignKeyName: "consents_treatment_plan_id_fkey";
            columns: ["treatment_plan_id"];
            isOneToOne: false;
            referencedRelation: "treatment_plan";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consents_plan_item_id_fkey";
            columns: ["plan_item_id"];
            isOneToOne: false;
            referencedRelation: "plan_item";
            referencedColumns: ["id"];
          },
        ];
      };
      // Imágenes/radiografías clínicas (odontología) — metadatos; el BINARIO vive
      // en el bucket PRIVADO `patient-media` (storage_path), acceso vía signed URLs.
      // 1:N desde clinical_records vía customer_id+salon_id. Ver migración
      // 20260801110000_consents_images.sql.
      patient_images: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          treatment_plan_id: string | null;
          fdi_code: number | null;
          modality: ImageModality;
          taken_at: string | null;
          taken_by: string | null;
          device: string | null;
          storage_path: string;
          thumbnail_path: string | null;
          mime: string | null;
          dicom_metadata: Json | null;
          tags: string[];
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          treatment_plan_id?: string | null;
          fdi_code?: number | null;
          modality: ImageModality;
          taken_at?: string | null;
          taken_by?: string | null;
          device?: string | null;
          storage_path: string;
          thumbnail_path?: string | null;
          mime?: string | null;
          dicom_metadata?: Json | null;
          tags?: string[]; // default '{}'
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          treatment_plan_id?: string | null;
          fdi_code?: number | null;
          modality?: ImageModality;
          taken_at?: string | null;
          taken_by?: string | null;
          device?: string | null;
          storage_path?: string;
          thumbnail_path?: string | null;
          mime?: string | null;
          dicom_metadata?: Json | null;
          tags?: string[];
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_images_customer_fk";
            columns: ["customer_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "clinical_records";
            referencedColumns: ["customer_id", "salon_id"];
          },
          {
            foreignKeyName: "patient_images_treatment_plan_id_fkey";
            columns: ["treatment_plan_id"];
            isOneToOne: false;
            referencedRelation: "treatment_plan";
            referencedColumns: ["id"];
          },
        ];
      };
      // Recetas / prescripciones (odontología) — cabecera. Borrador → emitida →
      // revocada; INMUTABLE tras emitir (trigger prescription_guard en BD).
      // 1:N desde clinical_records vía customer_id+salon_id. Ver migración
      // 20260801140000_prescriptions.sql.
      prescription: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          prescriber_id: string | null;
          prescriber_name: string | null;
          diagnosis: string | null;
          notes: string | null;
          status: PrescriptionStatus;
          issued_at: string | null;
          signed_by: string | null;
          revoked_at: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          prescriber_id?: string | null;
          prescriber_name?: string | null;
          diagnosis?: string | null;
          notes?: string | null;
          status?: PrescriptionStatus; // default 'draft'
          issued_at?: string | null;
          signed_by?: string | null;
          revoked_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          prescriber_id?: string | null;
          prescriber_name?: string | null;
          diagnosis?: string | null;
          notes?: string | null;
          status?: PrescriptionStatus;
          issued_at?: string | null;
          signed_by?: string | null;
          revoked_at?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prescription_customer_fk";
            columns: ["customer_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "clinical_records";
            referencedColumns: ["customer_id", "salon_id"];
          },
        ];
      };
      // Renglones de medicación de una receta. INMUTABLES cuando la cabecera ya
      // no es 'draft' (trigger prescription_item_guard en BD).
      prescription_item: {
        Row: {
          id: string;
          salon_id: string;
          prescription_id: string;
          position: number;
          medication: string;
          dose: string | null;
          frequency: string | null;
          duration: string | null;
          quantity: string | null;
          instructions: string | null;
        };
        Insert: {
          id?: string;
          salon_id: string;
          prescription_id: string;
          position?: number; // default 0
          medication: string;
          dose?: string | null;
          frequency?: string | null;
          duration?: string | null;
          quantity?: string | null;
          instructions?: string | null;
        };
        Update: {
          id?: string;
          salon_id?: string;
          prescription_id?: string;
          position?: number;
          medication?: string;
          dose?: string | null;
          frequency?: string | null;
          duration?: string | null;
          quantity?: string | null;
          instructions?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "prescription_item_fk";
            columns: ["prescription_id", "salon_id"];
            isOneToOne: false;
            referencedRelation: "prescription";
            referencedColumns: ["id", "salon_id"];
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

      /**
       * FILTROS de facturación en servidor (migración
       * `20260723110000_rpc_invoices_filtered`). SOLO LECTURA, SECURITY INVOKER
       * (aislamiento por RLS). Todos los filtros son opcionales (null = sin
       * filtro); `p_from`/`p_to` son fechas locales del salón (`p_to` inclusivo).
       * Ver `@/lib/facturacion/queries` para los envoltorios tipados.
       */

      /** Libro de facturas filtrado (rango, sede, tipo, método, búsqueda). */
      salon_invoices_filtered: {
        Args: {
          p_salon_id: string;
          p_from?: string | null;
          p_to?: string | null;
          p_location_id?: string | null;
          p_invoice_type?: string | null;
          p_payment_method?: string | null;
          p_search?: string | null;
          p_limit?: number;
        };
        Returns: {
          id: string;
          full_number: string;
          invoice_type: PosInvoiceType;
          issued_at: string;
          recipient_data: Json | null;
          taxable_base_cents: number;
          tax_cents: number;
          total_cents: number;
          currency: string;
        }[];
      };

      /** Totales del periodo filtrado (nº de facturas + Σ base, IVA, total). */
      salon_invoices_totals: {
        Args: {
          p_salon_id: string;
          p_from?: string | null;
          p_to?: string | null;
          p_location_id?: string | null;
          p_invoice_type?: string | null;
          p_payment_method?: string | null;
          p_search?: string | null;
        };
        Returns: {
          invoice_count: number;
          taxable_base_cents: number;
          tax_cents: number;
          total_cents: number;
        }[];
      };

      /**
       * Creación atómica del plan de pago de ortodoncia + sus cuotas
       * (migración `20260811130000_ortho_payments`). SECURITY DEFINER, gate
       * owner/manager. `p_installments` es un array de {seq, dueDate,
       * amountCents} calculado en la app. Devuelve el id del plan creado.
       */
      create_ortho_payment_plan: {
        Args: {
          p_salon_id: string;
          p_customer_id: string;
          p_total_cents: number;
          p_down_payment_cents: number;
          p_installment_count: number;
          p_day_of_month: number;
          p_start_date: string;
          p_currency: string;
          p_notes: string | null;
          p_installments: Json;
        };
        Returns: string;
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
      salon_sector: SalonSector;
      allergen: Allergen;
      consent_type: ConsentType;
      consent_status: ConsentStatus;
      image_modality: ImageModality;
      stock_movement_kind: StockMovementKind;
      order_status: OrderStatus;
      order_item_status: OrderItemStatus;
      table_shape: TableShape;
      table_status: TableStatus;
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
export type SalonOpeningHour = Tables<"salon_opening_hours">;
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
// Ficha clínica — datos categoría especial RGPD Art. 9 (1:1 con customers)
export type ClinicalRecord = Tables<"clinical_records">;
export type ClinicalRecordInsert = TablesInsert<"clinical_records">;
export type ClinicalRecordUpdate = TablesUpdate<"clinical_records">;

// Odontograma — hallazgos clínicos append-only
export type OdontogramFinding = Tables<"odontogram_findings">;
export type OdontogramFindingInsert = TablesInsert<"odontogram_findings">;

// Periodontograma — cabecera (perio_exam), datos por diente (perio_tooth) y
// mediciones por sitio (perio_site). Inamovibles cuando perio_exam.signed = TRUE.
export type PerioExam = Tables<"perio_exam">;
export type PerioExamInsert = TablesInsert<"perio_exam">;

// Planes de tratamiento / presupuestos — cabecera (treatment_plan), fases
// (plan_phase) y líneas presupuestadas (plan_item).
export type TreatmentPlan = Tables<"treatment_plan">;
export type TreatmentPlanInsert = TablesInsert<"treatment_plan">;
export type PlanPhase = Tables<"plan_phase">;
export type PlanPhaseInsert = TablesInsert<"plan_phase">;
export type PlanItem = Tables<"plan_item">;
export type PlanItemInsert = TablesInsert<"plan_item">;
export type PerioTooth = Tables<"perio_tooth">;
export type PerioToothInsert = TablesInsert<"perio_tooth">;
export type PerioSite = Tables<"perio_site">;
export type PerioSiteInsert = TablesInsert<"perio_site">;

// Ortodoncia — log de progreso por visita (Fase 1). Ficha y tratamiento en
// clinical_records.data.ortho (JSONB); esta tabla registra una entrada por
// visita.
export type OrthoVisit = Tables<"ortho_visit">;

// Ortodoncia — plan de pago (Fase 2 económico) — cabecera (ortho_payment_plan)
// y cuotas (ortho_installment). Creación atómica vía RPC create_ortho_payment_plan.
export type OrthoPaymentPlan = Tables<"ortho_payment_plan">;
export type OrthoInstallment = Tables<"ortho_installment">;
export type LabOrder = Tables<"lab_order">;

// Mutuas y seguros (odontología) — aseguradoras (insurer), póliza del paciente
// (customer_insurance) y baremo por servicio (insurer_service_price).
export type Insurer = Tables<"insurer">;
export type InsurerInsert = TablesInsert<"insurer">;
export type CustomerInsurance = Tables<"customer_insurance">;
export type CustomerInsuranceInsert = TablesInsert<"customer_insurance">;
export type InsurerServicePrice = Tables<"insurer_service_price">;
export type InsurerServicePriceInsert = TablesInsert<"insurer_service_price">;

// Consentimientos informados + imágenes/radiografías (odontología) — bucket
// privado `patient-media`. Ambas 1:N desde clinical_records (customer_id+salon_id).
export type Consent = Tables<"consents">;
export type ConsentInsert = TablesInsert<"consents">;
export type PatientImage = Tables<"patient_images">;
export type PatientImageInsert = TablesInsert<"patient_images">;

// Recetas / prescripciones (odontología) — cabecera (prescription) + renglones
// de medicación (prescription_item). INMUTABLE tras emitir (trigger BD).
export type Prescription = Tables<"prescription">;
export type PrescriptionInsert = TablesInsert<"prescription">;
export type PrescriptionItem = Tables<"prescription_item">;
export type PrescriptionItemInsert = TablesInsert<"prescription_item">;

// Notas de visita — nota clínica 1:1 con visits; inamovible cuando signed = TRUE
export type VisitNote = Tables<"visit_notes">;
export type VisitNoteInsert = TablesInsert<"visit_notes">;
export type VisitNoteUpdate = TablesUpdate<"visit_notes">;

// Stock/inventario de material — libro de movimientos (todos los sectores, sin
// gate de sector). Ver `@/lib/stock` (lógica pura) y
// `products/stock-actions.ts` (Server Action que persiste + actualiza products.stock).
export type StockMovement = Tables<"stock_movement">;
export type StockMovementInsert = TablesInsert<"stock_movement">;

// Escandallo (BOM) de materiales por tratamiento — vincula servicios con los
// productos que consumen (Fase 2 del inventario). Ver
// `@/lib/queries/service-material.ts` y
// `ajustes/servicios/material-actions.ts`.
export type ServiceMaterial = Tables<"service_material">;
export type ServiceMaterialInsert = TablesInsert<"service_material">;

// Carta (restauración) — categorías y estaciones de producción. Ver
// migración 20260809120000_restauracion_menu_base.
export type MenuCategory = Tables<"menu_categories">;
export type Station = Tables<"stations">;

// Modificadores de la carta (restauración) — grupos de opciones, opciones y
// su asignación a productos. Ver migración
// 20260809121000_restauracion_modifiers.
export type ModifierGroup = Tables<"modifier_groups">;
export type Modifier = Tables<"modifiers">;
export type ProductModifierGroup = Tables<"product_modifier_groups">;

// Combos (restauración) — piezas de un producto combo con ruteo por estación
// opcional. Ver migración 20260809122000_restauracion_combos.
export type ComboComponent = Tables<"combo_components">;

// Pedidos de mostrador (restauración), append-only — cabecera (orders) y
// líneas (order_items). IDs generados en cliente (offline-ready): `id` es
// REQUERIDO en los Insert (sin default en BD). Ver migración
// 20260810100000_restauracion_orders.
export type Order = Tables<"orders">;
export type OrderInsert = TablesInsert<"orders">;
export type OrderItem = Tables<"order_items">;
export type OrderItemInsert = TablesInsert<"order_items">;

// Sala (restauración) — zonas y mesas del plano, enlazadas con orders vía
// dining_table_id/covers. Ver migración 20260810130000_restauracion_sala.
export type DiningZone = Tables<"dining_zones">;
export type DiningTable = Tables<"dining_tables">;

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
