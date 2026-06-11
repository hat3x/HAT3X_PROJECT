# Skill: supabase-rls

**Invocación:** `/supabase-rls`

**Propósito:** Experto en Supabase: diseño de esquemas, Row Level Security (RLS), Edge Functions, Realtime, Storage y autenticación. Garantiza seguridad y escalabilidad desde el primer día.

---

## Trigger

Se activa cuando el usuario trabaja con Supabase, pide configurar RLS, crear migraciones, Edge Functions, o diseñar el schema de base de datos.

---

## Row Level Security — Patrones esenciales

### Patrón 1: El usuario solo ve sus propios datos
```sql
-- El caso más común
CREATE POLICY "Users see own data"
ON public.profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
```

### Patrón 2: Datos de cliente vía tabla intermedia
```sql
-- El usuario accede a datos relacionados con su customer_id
CREATE POLICY "Customer sees own appointments"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  customer_id IN (
    SELECT id FROM public.customers
    WHERE user_id = auth.uid()
  )
);
```

### Patrón 3: Staff/Admin ve todo
```sql
-- Roles: admin, manager, staff, customer
CREATE POLICY "Staff can read all"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'manager', 'staff')
  )
);
```

### Patrón 4: INSERT solo datos propios
```sql
CREATE POLICY "Users insert own data"
ON public.appointments
FOR INSERT
TO authenticated
WITH CHECK (
  customer_id IN (
    SELECT id FROM public.customers
    WHERE user_id = auth.uid()
  )
);
```

### Patrón 5: UPDATE con restricciones de estado
```sql
CREATE POLICY "Customer can cancel own appointment"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  AND status IN ('CONFIRMED', 'RESCHEDULED') -- solo cancelar activas
)
WITH CHECK (
  status = 'CANCELLED' -- solo puede cambiar a CANCELLED
);
```

---

## Edge Functions — Estructura estándar

```typescript
// supabase/functions/[nombre]/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Cliente con permisos de service_role para operaciones admin
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Cliente con permisos del usuario autenticado
    const authHeader = req.headers.get('Authorization')!
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verificar usuario autenticado
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()

    // ... lógica de negocio ...

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

---

## Triggers y funciones automáticas

```sql
-- Auto-crear perfil al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.customers (user_id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## Comandos esenciales

```bash
# Generar tipos TypeScript desde la DB
npx supabase gen types typescript --local > src/integrations/supabase/types.ts
# O desde proyecto remoto:
npx supabase gen types typescript --project-id [PROJECT_ID] > src/integrations/supabase/types.ts

# Nueva migración
npx supabase migration new [nombre_descriptivo]

# Aplicar migraciones a producción
npx supabase db push

# Ver diff entre local y remoto
npx supabase db diff

# Deploy de Edge Function
npx supabase functions deploy [nombre]

# Logs de Edge Function
npx supabase functions logs [nombre]
```

---

## Checklist de seguridad Supabase

- [ ] RLS habilitado en TODAS las tablas (`ALTER TABLE x ENABLE ROW LEVEL SECURITY`)
- [ ] Ninguna policy con `USING (true)` sin restricción adicional
- [ ] Service Role Key NUNCA en variables `VITE_*` (solo en Edge Functions)
- [ ] Anon Key OK en frontend (es pública por diseño)
- [ ] Tipos regenerados tras cada migración (`supabase gen types`)
- [ ] Datos sensibles en columnas con RLS restrictivo
- [ ] Funciones RPC con `SECURITY DEFINER` solo cuando es necesario
- [ ] Backup automático habilitado en el proyecto
