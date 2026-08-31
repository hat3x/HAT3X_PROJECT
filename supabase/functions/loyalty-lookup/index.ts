// loyalty-lookup — Edge Function de SOLO LECTURA.
//
// Dado el qr_token de un cliente, devuelve su cuenta de fidelización: puntos,
// cupones de bienvenida activos y recompensas disponibles. NO canjea ni escribe
// nada — es la consulta que el TPV de Salón OS hace AL ESCANEAR el QR para
// mostrar el descuento aplicable antes de cobrar. El canje real lo hace
// verify-visit al confirmar el cobro.
//
// Autenticación (acepta CUALQUIERA de las dos):
//   - x-api-key: clave de servicio (dn9_...) validada contra la tabla api_keys.
//     Es la que usa Salón OS (sistema externo).
//   - Authorization: Bearer <token staff>  (mismo patrón que verify-visit).
//
// Aditivo: no modifica ninguna función ni tabla existente.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-api-key',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const db = createClient(supabaseUrl, serviceRoleKey)

    // ── Autorización: API key de servicio O token de staff ──────────────────
    let authorized = false

    const apiKey = req.headers.get('x-api-key')
    if (apiKey) {
      const keyHash = await sha256Hex(apiKey)
      const { data: keyRow } = await db
        .from('api_keys')
        .select('id, is_active')
        .eq('key_hash', keyHash)
        .eq('is_active', true)
        .maybeSingle()
      if (keyRow) authorized = true
    }

    if (!authorized) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '')
        const { data: { user: staffUser } } = await db.auth.getUser(token)
        if (staffUser) {
          const { data: roleData } = await db
            .from('user_roles')
            .select('role')
            .eq('user_id', staffUser.id)
            .in('role', ['staff', 'manager', 'admin'])
            .limit(1)
          if (roleData && roleData.length > 0) authorized = true
        }
      }
    }

    if (!authorized) {
      return json({ error: 'No autorizado: se requiere x-api-key de servicio o token de staff' }, 401)
    }

    // ── Entrada ─────────────────────────────────────────────────────────────
    const { qr_token } = await req.json().catch(() => ({}))
    if (!qr_token || typeof qr_token !== 'string') {
      return json({ error: 'qr_token es obligatorio' }, 400)
    }

    // ── Cliente por qr_token ────────────────────────────────────────────────
    const { data: customer, error: custError } = await db
      .from('customers')
      .select('id, first_name, last_name, status')
      .eq('qr_token', qr_token)
      .maybeSingle()

    if (custError || !customer) {
      return json({ error: 'Cliente no encontrado' }, 404)
    }
    if (customer.status === 'DISABLED') {
      return json({ error: 'La cuenta del cliente está deshabilitada' }, 403)
    }

    const now = new Date().toISOString()

    // ── Puntos ──────────────────────────────────────────────────────────────
    const { data: account } = await db
      .from('loyalty_accounts')
      .select('points_balance, visits_total, last_visit_at')
      .eq('customer_id', customer.id)
      .maybeSingle()

    // ── Cupones de bienvenida activos y no caducados ────────────────────────
    const { data: coupons } = await db
      .from('welcome_coupons')
      .select('id, percent_off, expires_at, status')
      .eq('customer_id', customer.id)
      .eq('status', 'ACTIVE')
      .gt('expires_at', now)

    // ── Recompensas disponibles ─────────────────────────────────────────────
    const { data: rewards } = await db
      .from('rewards')
      .select('id, type, code, expires_at, status')
      .eq('customer_id', customer.id)
      .eq('status', 'AVAILABLE')
      .gt('expires_at', now)

    return json({
      customer: {
        id: customer.id,
        first_name: customer.first_name,
        last_name: customer.last_name,
      },
      points_balance: account?.points_balance ?? 0,
      visits_total: account?.visits_total ?? 0,
      last_visit_at: account?.last_visit_at ?? null,
      welcome_coupons: (coupons ?? []).map((c) => ({
        id: c.id,
        percent_off: c.percent_off,
        expires_at: c.expires_at,
      })),
      rewards: (rewards ?? []).map((r) => ({
        id: r.id,
        type: r.type,
        code: r.code,
        expires_at: r.expires_at,
      })),
    })
  } catch (err) {
    console.error('[loyalty-lookup]', err)
    return json({ error: 'Error interno' }, 500)
  }
})
