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
      check_agregados: {
        Row: {
          bucket: string
          check_id: string
          granularidad: string
          latencia_p50: number | null
          latencia_p95: number | null
          ok: number
          total: number
        }
        Insert: {
          bucket: string
          check_id: string
          granularidad: string
          latencia_p50?: number | null
          latencia_p95?: number | null
          ok: number
          total: number
        }
        Update: {
          bucket?: string
          check_id?: string
          granularidad?: string
          latencia_p50?: number | null
          latencia_p95?: number | null
          ok?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "check_agregados_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "checks"
            referencedColumns: ["id"]
          },
        ]
      }
      check_resultados: {
        Row: {
          check_id: string
          error: string | null
          id: number
          latencia_ms: number | null
          ok: boolean
          status_code: number | null
          ts: string
        }
        Insert: {
          check_id: string
          error?: string | null
          id?: number
          latencia_ms?: number | null
          ok: boolean
          status_code?: number | null
          ts?: string
        }
        Update: {
          check_id?: string
          error?: string | null
          id?: number
          latencia_ms?: number | null
          ok?: boolean
          status_code?: number | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_resultados_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "checks"
            referencedColumns: ["id"]
          },
        ]
      }
      checks: {
        Row: {
          activo: boolean
          cabeceras: Json | null
          creado_en: string
          credencial_id: string | null
          cuerpo: string | null
          espera_status: number[]
          espera_texto: string | null
          estado: string
          fallos_consecutivos: number
          id: string
          intervalo_s: number
          metodo: string
          notifica: boolean
          proximo_check_en: string
          servicio_id: string
          timeout_ms: number
          tipo: string
          ultimo_check_en: string | null
          umbral_fallos: number
          umbral_latencia_ms: number | null
          url: string | null
        }
        Insert: {
          activo?: boolean
          cabeceras?: Json | null
          creado_en?: string
          credencial_id?: string | null
          cuerpo?: string | null
          espera_status?: number[]
          espera_texto?: string | null
          estado?: string
          fallos_consecutivos?: number
          id?: string
          intervalo_s?: number
          metodo?: string
          notifica?: boolean
          proximo_check_en?: string
          servicio_id: string
          timeout_ms?: number
          tipo: string
          ultimo_check_en?: string | null
          umbral_fallos?: number
          umbral_latencia_ms?: number | null
          url?: string | null
        }
        Update: {
          activo?: boolean
          cabeceras?: Json | null
          creado_en?: string
          credencial_id?: string | null
          cuerpo?: string | null
          espera_status?: number[]
          espera_texto?: string | null
          estado?: string
          fallos_consecutivos?: number
          id?: string
          intervalo_s?: number
          metodo?: string
          notifica?: boolean
          proximo_check_en?: string
          servicio_id?: string
          timeout_ms?: number
          tipo?: string
          ultimo_check_en?: string | null
          umbral_fallos?: number
          umbral_latencia_ms?: number | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checks_credencial_id_fkey"
            columns: ["credencial_id"]
            isOneToOne: false
            referencedRelation: "credenciales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checks_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
        ]
      }
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
      credencial_usos: {
        Row: {
          contexto: string | null
          credencial_id: string
          id: number
          usada_en: string
          usuario_id: string | null
        }
        Insert: {
          contexto?: string | null
          credencial_id: string
          id?: number
          usada_en?: string
          usuario_id?: string | null
        }
        Update: {
          contexto?: string | null
          credencial_id?: string
          id?: number
          usada_en?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credencial_usos_credencial_id_fkey"
            columns: ["credencial_id"]
            isOneToOne: false
            referencedRelation: "credenciales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credencial_usos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credenciales: {
        Row: {
          creado_en: string
          etiqueta: string
          id: string
          iv: string
          prefijo: string | null
          proveedor: string
          proyecto_id: string | null
          rotada_en: string | null
          secreto_cifrado: string
          tag: string
        }
        Insert: {
          creado_en?: string
          etiqueta: string
          id?: string
          iv: string
          prefijo?: string | null
          proveedor: string
          proyecto_id?: string | null
          rotada_en?: string | null
          secreto_cifrado: string
          tag: string
        }
        Update: {
          creado_en?: string
          etiqueta?: string
          id?: string
          iv?: string
          prefijo?: string | null
          proveedor?: string
          proyecto_id?: string | null
          rotada_en?: string | null
          secreto_cifrado?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "credenciales_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      descubrimientos: {
        Row: {
          altas: number
          ejecutado_en: string
          error: string | null
          id: number
          ok: boolean
          pausados: number
          reactivados: number
        }
        Insert: {
          altas?: number
          ejecutado_en?: string
          error?: string | null
          id?: number
          ok: boolean
          pausados?: number
          reactivados?: number
        }
        Update: {
          altas?: number
          ejecutado_en?: string
          error?: string | null
          id?: number
          ok?: boolean
          pausados?: number
          reactivados?: number
        }
        Relationships: []
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
      incidencias: {
        Row: {
          abierta_en: string
          causa: string | null
          cerrada_en: string | null
          check_id: string
          id: string
          notificada_en: string | null
          recuperacion_notificada_en: string | null
          servicio_id: string
          severidad: string
          silenciada_hasta: string | null
          ultimo_error: string | null
        }
        Insert: {
          abierta_en?: string
          causa?: string | null
          cerrada_en?: string | null
          check_id: string
          id?: string
          notificada_en?: string | null
          recuperacion_notificada_en?: string | null
          servicio_id: string
          severidad: string
          silenciada_hasta?: string | null
          ultimo_error?: string | null
        }
        Update: {
          abierta_en?: string
          causa?: string | null
          cerrada_en?: string | null
          check_id?: string
          id?: string
          notificada_en?: string | null
          recuperacion_notificada_en?: string | null
          servicio_id?: string
          severidad?: string
          silenciada_hasta?: string | null
          ultimo_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      notas: {
        Row: {
          autor_id: string | null
          contenido: string
          creado_en: string
          entidad_id: string
          entidad_tipo: string
          id: string
        }
        Insert: {
          autor_id?: string | null
          contenido: string
          creado_en?: string
          entidad_id: string
          entidad_tipo: string
          id?: string
        }
        Update: {
          autor_id?: string | null
          contenido?: string
          creado_en?: string
          entidad_id?: string
          entidad_tipo?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones: {
        Row: {
          canal: string
          enviada_en: string
          error: string | null
          id: number
          incidencia_id: string | null
          ok: boolean
          usuario_id: string
        }
        Insert: {
          canal: string
          enviada_en?: string
          error?: string | null
          id?: number
          incidencia_id?: string | null
          ok: boolean
          usuario_id: string
        }
        Update: {
          canal?: string
          enviada_en?: string
          error?: string | null
          id?: number
          incidencia_id?: string | null
          ok?: boolean
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_incidencia_id_fkey"
            columns: ["incidencia_id"]
            isOneToOne: false
            referencedRelation: "incidencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          avatar_url: string | null
          creado_en: string
          es_propietario: boolean
          id: string
          nombre: string | null
          paleta: string
          tema: string
          vista_resumen: string
        }
        Insert: {
          avatar_url?: string | null
          creado_en?: string
          es_propietario?: boolean
          id: string
          nombre?: string | null
          paleta?: string
          tema?: string
          vista_resumen?: string
        }
        Update: {
          avatar_url?: string | null
          creado_en?: string
          es_propietario?: boolean
          id?: string
          nombre?: string | null
          paleta?: string
          tema?: string
          vista_resumen?: string
        }
        Relationships: []
      }
      permisos: {
        Row: {
          creado_en: string
          id: string
          proyecto_id: string
          rol: string
          usuario_id: string
        }
        Insert: {
          creado_en?: string
          id?: string
          proyecto_id: string
          rol: string
          usuario_id: string
        }
        Update: {
          creado_en?: string
          id?: string
          proyecto_id?: string
          rol?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permisos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permisos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
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
      servicios: {
        Row: {
          activo: boolean
          cliente_id: string | null
          creado_en: string
          id: string
          nombre: string
          orden: number
          proveedor: string | null
          proyecto_id: string
          tipo: string
        }
        Insert: {
          activo?: boolean
          cliente_id?: string | null
          creado_en?: string
          id?: string
          nombre: string
          orden?: number
          proveedor?: string | null
          proyecto_id: string
          tipo: string
        }
        Update: {
          activo?: boolean
          cliente_id?: string | null
          creado_en?: string
          id?: string
          nombre?: string
          orden?: number
          proveedor?: string | null
          proyecto_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "servicios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      suscripciones_push: {
        Row: {
          auth: string
          creada_en: string
          dispositivo: string | null
          endpoint: string
          id: string
          p256dh: string
          ultima_ok_en: string | null
          usuario_id: string
        }
        Insert: {
          auth: string
          creada_en?: string
          dispositivo?: string | null
          endpoint: string
          id?: string
          p256dh: string
          ultima_ok_en?: string | null
          usuario_id: string
        }
        Update: {
          auth?: string
          creada_en?: string
          dispositivo?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          ultima_ok_en?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suscripciones_push_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ventanas_mantenimiento: {
        Row: {
          creado_en: string
          desde: string
          hasta: string
          id: string
          motivo: string | null
          proyecto_id: string
        }
        Insert: {
          creado_en?: string
          desde: string
          hasta: string
          id?: string
          motivo?: string | null
          proyecto_id: string
        }
        Update: {
          creado_en?: string
          desde?: string
          hasta?: string
          id?: string
          motivo?: string | null
          proyecto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventanas_mantenimiento_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      contratos_visibles: {
        Row: {
          addons: string[] | null
          alta: string | null
          baja: string | null
          cliente_id: string | null
          creado_en: string | null
          cuota_mensual: number | null
          estado: string | null
          id: string | null
          moneda: string | null
          notas: string | null
          proyecto_id: string | null
        }
        Insert: {
          addons?: string[] | null
          alta?: string | null
          baja?: string | null
          cliente_id?: string | null
          creado_en?: string | null
          cuota_mensual?: never
          estado?: string | null
          id?: string | null
          moneda?: string | null
          notas?: never
          proyecto_id?: string | null
        }
        Update: {
          addons?: string[] | null
          alta?: string | null
          baja?: string | null
          cliente_id?: string | null
          creado_en?: string | null
          cuota_mensual?: never
          estado?: string | null
          id?: string | null
          moneda?: string | null
          notas?: never
          proyecto_id?: string | null
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
    }
    Functions: {
      atlas_consolidar_retencion: { Args: never; Returns: undefined }
      atlas_disparar_avisos: { Args: never; Returns: undefined }
      atlas_disparar_descubridor: { Args: never; Returns: undefined }
      atlas_disparar_vigia: { Args: never; Returns: undefined }
      atlas_edita_proyecto: { Args: { p: string }; Returns: boolean }
      atlas_es_propietario: { Args: never; Returns: boolean }
      atlas_podar_descubrimientos: { Args: never; Returns: undefined }
      atlas_ve_cliente: { Args: { c: string }; Returns: boolean }
      atlas_ve_proyecto: { Args: { p: string }; Returns: boolean }
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

