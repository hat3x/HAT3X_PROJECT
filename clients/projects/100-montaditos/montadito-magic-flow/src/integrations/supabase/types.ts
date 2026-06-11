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
      alergenos: {
        Row: {
          codigo: string
          created_at: string
          descripcion: string | null
          icono: string | null
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          codigo: string
          created_at?: string
          descripcion?: string | null
          icono?: string | null
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          codigo?: string
          created_at?: string
          descripcion?: string | null
          icono?: string | null
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      franchisees: {
        Row: {
          activo: boolean
          application_fee_percent: number
          created_at: string
          email: string
          id: string
          nombre: string
          stripe_account_id: string | null
          stripe_onboarding_completed: boolean
          updated_at: string
        }
        Insert: {
          activo?: boolean
          application_fee_percent?: number
          created_at?: string
          email: string
          id?: string
          nombre: string
          stripe_account_id?: string | null
          stripe_onboarding_completed?: boolean
          updated_at?: string
        }
        Update: {
          activo?: boolean
          application_fee_percent?: number
          created_at?: string
          email?: string
          id?: string
          nombre?: string
          stripe_account_id?: string | null
          stripe_onboarding_completed?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      locales: {
        Row: {
          activo: boolean
          ciudad: string
          created_at: string
          direccion: string | null
          franchisee_id: string
          horarios: Json | null
          id: string
          lat: number | null
          lng: number | null
          nombre: string
          sitio_web: string | null
          slug: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          ciudad: string
          created_at?: string
          direccion?: string | null
          franchisee_id: string
          horarios?: Json | null
          id?: string
          lat?: number | null
          lng?: number | null
          nombre: string
          sitio_web?: string | null
          slug: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          ciudad?: string
          created_at?: string
          direccion?: string | null
          franchisee_id?: string
          horarios?: Json | null
          id?: string
          lat?: number | null
          lng?: number | null
          nombre?: string
          sitio_web?: string | null
          slug?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locales_franchisee_id_fkey"
            columns: ["franchisee_id"]
            isOneToOne: false
            referencedRelation: "franchisees"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categorias: {
        Row: {
          created_at: string
          id: string
          imagen_url: string | null
          logo_url: string | null
          nombre: string
          orden: number
        }
        Insert: {
          created_at?: string
          id?: string
          imagen_url?: string | null
          logo_url?: string | null
          nombre: string
          orden?: number
        }
        Update: {
          created_at?: string
          id?: string
          imagen_url?: string | null
          logo_url?: string | null
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      menu_productos: {
        Row: {
          categoria_id: string
          contiene_alcohol: boolean
          created_at: string
          descripcion: string | null
          destacado: boolean
          disponible: boolean
          foto_url: string | null
          id: string
          local_id: string | null
          nombre: string
          nuevo: boolean
          numero: string | null
          precio: number
          seccion: string | null
          tipo_pan: string | null
          updated_at: string
        }
        Insert: {
          categoria_id: string
          contiene_alcohol?: boolean
          created_at?: string
          descripcion?: string | null
          destacado?: boolean
          disponible?: boolean
          foto_url?: string | null
          id?: string
          local_id?: string | null
          nombre: string
          nuevo?: boolean
          numero?: string | null
          precio: number
          seccion?: string | null
          tipo_pan?: string | null
          updated_at?: string
        }
        Update: {
          categoria_id?: string
          contiene_alcohol?: boolean
          created_at?: string
          descripcion?: string | null
          destacado?: boolean
          disponible?: boolean
          foto_url?: string | null
          id?: string
          local_id?: string | null
          nombre?: string
          nuevo?: boolean
          numero?: string | null
          precio?: number
          seccion?: string | null
          tipo_pan?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "menu_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_productos_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      mesas: {
        Row: {
          activa: boolean
          id: string
          local_id: string
          numero_mesa: number
        }
        Insert: {
          activa?: boolean
          id?: string
          local_id: string
          numero_mesa: number
        }
        Update: {
          activa?: boolean
          id?: string
          local_id?: string
          numero_mesa?: number
        }
        Relationships: [
          {
            foreignKeyName: "mesas_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_items: {
        Row: {
          cantidad: number
          destino: string
          id: string
          pedido_id: string
          precio_unitario: number
          producto_id: string
        }
        Insert: {
          cantidad?: number
          destino?: string
          id?: string
          pedido_id: string
          precio_unitario: number
          producto_id: string
        }
        Update: {
          cantidad?: number
          destino?: string
          id?: string
          pedido_id?: string
          precio_unitario?: number
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "menu_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          created_at: string
          edad_verificada_cliente: boolean
          estado: Database["public"]["Enums"]["order_status"]
          estado_bebidas: Database["public"]["Enums"]["order_status"] | null
          estado_cocina: Database["public"]["Enums"]["order_status"] | null
          id: string
          local_id: string
          mesa_id: string | null
          notas: string | null
          numero_pedido: number
          session_id: string
          stripe_payment_id: string | null
          tipo: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          edad_verificada_cliente?: boolean
          estado?: Database["public"]["Enums"]["order_status"]
          estado_bebidas?: Database["public"]["Enums"]["order_status"] | null
          estado_cocina?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          local_id: string
          mesa_id?: string | null
          notas?: string | null
          numero_pedido: number
          session_id: string
          stripe_payment_id?: string | null
          tipo?: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          edad_verificada_cliente?: boolean
          estado?: Database["public"]["Enums"]["order_status"]
          estado_bebidas?: Database["public"]["Enums"]["order_status"] | null
          estado_cocina?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          local_id?: string
          mesa_id?: string | null
          notas?: string | null
          numero_pedido?: number
          session_id?: string
          stripe_payment_id?: string | null
          tipo?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_mesa_id_fkey"
            columns: ["mesa_id"]
            isOneToOne: false
            referencedRelation: "mesas"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_alergenos: {
        Row: {
          alergeno_id: string
          created_at: string
          producto_id: string
        }
        Insert: {
          alergeno_id: string
          created_at?: string
          producto_id: string
        }
        Update: {
          alergeno_id?: string
          created_at?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_alergenos_alergeno_id_fkey"
            columns: ["alergeno_id"]
            isOneToOne: false
            referencedRelation: "alergenos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_alergenos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "menu_productos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          local_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          local_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          local_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_cancel_stale_pedidos: { Args: never; Returns: undefined }
      auto_cancel_stale_pending_payment: { Args: never; Returns: undefined }
      cancel_own_pending_order: {
        Args: { _pedido_id: string }
        Returns: undefined
      }
      current_session_id: { Args: never; Returns: string }
      get_user_franchisee_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_for_local: {
        Args: {
          _local_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      resolve_pedido_item_destino: {
        Args: { _producto_id: string }
        Returns: string
      }
      sync_pedido_sections: { Args: { _pedido_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "caja" | "cocina" | "franchisee"
      order_status:
        | "pendiente_pago"
        | "pendiente"
        | "recibido"
        | "preparando"
        | "listo"
        | "entregado"
        | "cancelado"
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
      app_role: ["admin", "caja", "cocina", "franchisee"],
      order_status: [
        "pendiente_pago",
        "pendiente",
        "recibido",
        "preparando",
        "listo",
        "entregado",
        "cancelado",
      ],
    },
  },
} as const
