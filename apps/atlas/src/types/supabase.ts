export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      clientes: {
        Row: {
          actualizado_en: string
          cif: string | null
          color_acento: string | null
          creado_en: string
          direccion: string | null
          estado: string
          id: string
          nombre: string
          notas: string | null
          portada_url: string | null
          razon_social: string | null
          sector: string | null
          slug: string
        }
        Insert: {
          actualizado_en?: string
          cif?: string | null
          color_acento?: string | null
          creado_en?: string
          direccion?: string | null
          estado?: string
          id?: string
          nombre: string
          notas?: string | null
          portada_url?: string | null
          razon_social?: string | null
          sector?: string | null
          slug: string
        }
        Update: {
          actualizado_en?: string
          cif?: string | null
          color_acento?: string | null
          creado_en?: string
          direccion?: string | null
          estado?: string
          id?: string
          nombre?: string
          notas?: string | null
          portada_url?: string | null
          razon_social?: string | null
          sector?: string | null
          slug?: string
        }
        Relationships: []
      }
      contactos: {
        Row: {
          cliente_id: string
          creado_en: string
          email: string | null
          es_principal: boolean
          id: string
          nombre: string
          rol: string | null
          telefono: string | null
        }
        Insert: {
          cliente_id: string
          creado_en?: string
          email?: string | null
          es_principal?: boolean
          id?: string
          nombre: string
          rol?: string | null
          telefono?: string | null
        }
        Update: {
          cliente_id?: string
          creado_en?: string
          email?: string | null
          es_principal?: boolean
          id?: string
          nombre?: string
          rol?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contactos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          addons: string[]
          alta: string
          baja: string | null
          cliente_id: string
          creado_en: string
          cuota_mensual: number | null
          estado: string
          id: string
          moneda: string
          notas: string | null
          proyecto_id: string
        }
        Insert: {
          addons?: string[]
          alta: string
          baja?: string | null
          cliente_id: string
          creado_en?: string
          cuota_mensual?: number | null
          estado?: string
          id?: string
          moneda?: string
          notas?: string | null
          proyecto_id: string
        }
        Update: {
          addons?: string[]
          alta?: string
          baja?: string | null
          cliente_id?: string
          creado_en?: string
          cuota_mensual?: number | null
          estado?: string
          id?: string
          moneda?: string
          notas?: string | null
          proyecto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      enlaces: {
        Row: {
          etiqueta: string
          id: string
          orden: number
          proyecto_id: string
          tipo: string | null
          url: string
        }
        Insert: {
          etiqueta: string
          id?: string
          orden?: number
          proyecto_id: string
          tipo?: string | null
          url: string
        }
        Update: {
          etiqueta?: string
          id?: string
          orden?: number
          proyecto_id?: string
          tipo?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "enlaces_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      proyectos: {
        Row: {
          actualizado_en: string
          creado_en: string
          descripcion: string | null
          estado: string
          gradiente: string | null
          id: string
          nombre: string
          portada_url: string | null
          repo_url: string | null
          ruta_repo: string | null
          slug: string
          stack: string[]
          tipo: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          descripcion?: string | null
          estado?: string
          gradiente?: string | null
          id?: string
          nombre: string
          portada_url?: string | null
          repo_url?: string | null
          ruta_repo?: string | null
          slug: string
          stack?: string[]
          tipo: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          descripcion?: string | null
          estado?: string
          gradiente?: string | null
          id?: string
          nombre?: string
          portada_url?: string | null
          repo_url?: string | null
          ruta_repo?: string | null
          slug?: string
          stack?: string[]
          tipo?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

