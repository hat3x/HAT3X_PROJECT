import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const PLAN_BENEFITS: Record<string, { key: string; label: string; limit: number }[]> = {
  MEN_19: [
    { key: 'monthly_cut', label: 'Corte moda mensual', limit: 1 },
  ],
  MEN_17: [
    { key: 'monthly_cut', label: 'Corte básico mensual', limit: 1 },
  ],
  LADIES_39: [
    { key: 'express_treatment', label: 'Tratamiento express', limit: 1 },
  ],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAuth = createClient(supabaseUrl, serviceRoleKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: staffUser }, error: authError } = await supabaseAuth.auth.getUser(token)
    if (authError || !staffUser) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check staff role
    const { data: roleData } = await supabaseAuth
      .from('user_roles')
      .select('role')
      .eq('user_id', staffUser.id)
      .in('role', ['staff', 'manager', 'admin'])
      .limit(1)

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: 'Unauthorized: staff role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { subscription_id, benefit_key, location_id } = await req.json()

    if (!subscription_id || !benefit_key || !location_id) {
      return new Response(JSON.stringify({ error: 'subscription_id, benefit_key and location_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get subscription
    const { data: sub } = await supabaseAuth
      .from('subscriptions')
      .select('id, plan, status, current_period_start, current_period_end, created_at')
      .eq('id', subscription_id)
      .single()

    if (!sub || sub.status !== 'ACTIVE') {
      return new Response(JSON.stringify({ error: 'Subscription not active' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate benefit exists for this plan
    const planBenefits = PLAN_BENEFITS[sub.plan] || []
    const benefit = planBenefits.find(b => b.key === benefit_key)
    if (!benefit) {
      return new Response(JSON.stringify({ error: 'Invalid benefit for this plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check usage in current period
    const periodStart = sub.current_period_start || sub.created_at
    const periodEnd = sub.current_period_end || new Date().toISOString()

    const { data: usages } = await supabaseAuth
      .from('club_benefit_usages')
      .select('id')
      .eq('subscription_id', subscription_id)
      .eq('benefit_key', benefit_key)
      .gte('used_at', periodStart)
      .lte('used_at', periodEnd)

    if ((usages || []).length >= benefit.limit) {
      return new Response(JSON.stringify({ error: 'Benefit already used this period' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Record usage
    await supabaseAuth.from('club_benefit_usages').insert({
      subscription_id,
      benefit_key,
      location_id,
      staff_actor_id: staffUser.id,
    })

    return new Response(JSON.stringify({ success: true, benefit_key }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('use-club-benefit error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
