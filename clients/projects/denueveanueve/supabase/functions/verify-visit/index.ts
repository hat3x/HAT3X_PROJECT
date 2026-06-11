import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const PLAN_BENEFITS: Record<string, { key: string; label: string; limit: number }[]> = {
  MEN_19: [
    { key: 'monthly_cut', label: 'Corte de pelo mensual', limit: 1 },
  ],
  LADIES_39: [
    { key: 'monthly_wash_blowdry', label: 'Lavado + peinado mensual', limit: 1 },
    { key: 'monthly_treatment', label: 'Tratamiento capilar mensual', limit: 1 },
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

    // Check staff has role
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

    const { qr_token, location_id, appointment_id, service_prices, redeem_coupon } = await req.json()

    if (!qr_token || !location_id) {
      return new Response(JSON.stringify({ error: 'qr_token and location_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up customer by QR token
    const { data: customer, error: custError } = await supabaseAuth
      .from('customers')
      .select('id, first_name, last_name, status')
      .eq('qr_token', qr_token)
      .single()

    if (custError || !customer) {
      return new Response(JSON.stringify({ error: 'Customer not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (customer.status === 'DISABLED') {
      return new Response(JSON.stringify({ error: 'Customer account is disabled' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const now = new Date().toISOString()

    // === CALCULATE POINTS FROM APPOINTMENT SERVICES ===
    let pointsToAdd = 0
    let pointsDetail: { service: string; price: number; points: number }[] = []

    if (appointment_id) {
      // Fetch appointment and verify it belongs to this customer
      const { data: appointment } = await supabaseAuth
        .from('appointments')
        .select('id, customer_id, status, points_awarded')
        .eq('id', appointment_id)
        .eq('customer_id', customer.id)
        .single()

      if (!appointment) {
        return new Response(JSON.stringify({ error: 'Appointment not found for this customer' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (appointment.points_awarded) {
        return new Response(JSON.stringify({ error: 'Points already awarded for this appointment' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Get appointment services
      const { data: services } = await supabaseAuth
        .from('appointment_services')
        .select('service_name_snapshot, unit_price_snapshot, price_type_snapshot, points_snapshot, final_price, final_points, quantity')
        .eq('appointment_id', appointment_id)

      // If staff sent overridden prices for variable-price services, apply them
      const priceOverrides: Record<string, number> = {}
      if (service_prices && Array.isArray(service_prices)) {
        for (const sp of service_prices) {
          if (sp.service_name && sp.final_price != null) {
            priceOverrides[sp.service_name] = sp.final_price
          }
        }
      }

      for (const svc of services || []) {
        const qty = svc.quantity || 1
        let price: number

        // Priority: staff override > final_price (already set) > unit_price_snapshot
        if (priceOverrides[svc.service_name_snapshot || ''] != null) {
          price = priceOverrides[svc.service_name_snapshot || '']
        } else if (svc.final_price != null) {
          price = svc.final_price
        } else if (svc.unit_price_snapshot != null) {
          price = svc.unit_price_snapshot * qty
        } else {
          price = 0
        }

        // If service has fixed_points override, use that; otherwise ceil(price/2)
        let svcPoints: number
        if (svc.final_points != null) {
          svcPoints = svc.final_points
        } else if (svc.points_snapshot != null) {
          svcPoints = svc.points_snapshot * qty
        } else {
          svcPoints = Math.ceil(price / 2)
        }

        pointsToAdd += svcPoints
        pointsDetail.push({
          service: svc.service_name_snapshot || 'Servicio',
          price,
          points: svcPoints,
        })
      }

      // Update appointment: mark points awarded and set final totals
      const finalTotalPrice = pointsDetail.reduce((sum, d) => sum + d.price, 0)
      await supabaseAuth
        .from('appointments')
        .update({
          points_awarded: true,
          verified_at: now,
          verified_by_staff_id: staffUser.id,
          status: 'COMPLETED',
          final_total_points: pointsToAdd,
          final_total_price: finalTotalPrice,
        })
        .eq('id', appointment_id)

      // Update final values on appointment_services if overrides were provided
      if (Object.keys(priceOverrides).length > 0) {
        for (const svc of services || []) {
          const overridePrice = priceOverrides[svc.service_name_snapshot || '']
          if (overridePrice != null) {
            const svcPoints = Math.ceil(overridePrice / 2)
            await supabaseAuth
              .from('appointment_services')
              .update({ final_price: overridePrice, final_points: svcPoints, is_completed: true })
              .eq('appointment_id', appointment_id)
              .eq('service_name_snapshot', svc.service_name_snapshot)
          }
        }
      }

    } else {
      // Walk-in (no appointment): staff can send service_prices array
      // or we default to 0 points if no price info provided
      if (service_prices && Array.isArray(service_prices)) {
        for (const sp of service_prices) {
          const price = sp.final_price || 0
          const pts = sp.points != null ? sp.points : Math.ceil(price / 2)
          pointsToAdd += pts
          pointsDetail.push({
            service: sp.service_name || 'Servicio',
            price,
            points: pts,
          })
        }
      }
      // If no services info at all, no points are awarded (staff must provide price data)
      if (pointsToAdd === 0 && (!service_prices || service_prices.length === 0)) {
        return new Response(JSON.stringify({ 
          error: 'No appointment_id or service_prices provided. Cannot calculate points.' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Update loyalty account: increment visits and points
    const { data: loyaltyBefore } = await supabaseAuth
      .from('loyalty_accounts')
      .select('*')
      .eq('customer_id', customer.id)
      .single()

    const newVisits = (loyaltyBefore?.visits_total || 0) + 1
    const newPoints = (loyaltyBefore?.points_balance || 0) + pointsToAdd

    await supabaseAuth
      .from('loyalty_accounts')
      .update({
        visits_total: newVisits,
        points_balance: newPoints,
        last_visit_at: now,
        last_activity_at: now,
      })
      .eq('customer_id', customer.id)

    // Record points movement
    await supabaseAuth
      .from('points_movements')
      .insert({
        customer_id: customer.id,
        type: 'EARN',
        points: pointsToAdd,
        reason: `Visita verificada: ${pointsDetail.map(d => d.service).join(', ')}`,
        ref_type: appointment_id ? 'appointment' : 'walk_in',
        ref_id: appointment_id || null,
      })

    // Record audit log
    await supabaseAuth
      .from('audit_logs')
      .insert({
        action: 'VERIFY_VISIT',
        actor_id: staffUser.id,
        actor_role: 'STAFF',
        entity: 'loyalty_accounts',
        entity_id: customer.id,
        location_id,
        metadata: { 
          visits_total: newVisits, 
          points_added: pointsToAdd, 
          points_detail: pointsDetail,
          appointment_id: appointment_id || null,
        },
      })

    // Check milestone rewards (3, 5, 8, 10 visits)
    const milestoneMap: Record<number, string> = {
      3: 'SCALP_DIAGNOSIS',
      5: 'EXPRESS_TREATMENT',
      8: 'RETAIL_VOUCHER',
      10: 'PACK_UPGRADE',
    }

    let unlockedReward: string | null = null

    if (milestoneMap[newVisits]) {
      const rewardType = milestoneMap[newVisits]
      const code = `RW-${rewardType.substring(0, 3)}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

      await supabaseAuth.from('rewards').insert({
        customer_id: customer.id,
        type: rewardType,
        code,
        expires_at: expiresAt,
        status: 'AVAILABLE',
      })

      unlockedReward = rewardType
    }

    // === PREMIUM / CLUB SUBSCRIPTION INFO ===
    let premium: {
      is_premium: boolean
      plan: string | null
      subscription_id: string | null
      benefits: { key: string; label: string; limit: number; used: boolean; used_at: string | null }[]
    } = { is_premium: false, plan: null, subscription_id: null, benefits: [] }

    const { data: activeSub } = await supabaseAuth
      .from('subscriptions')
      .select('id, plan, status, current_period_start, current_period_end, created_at')
      .eq('customer_id', customer.id)
      .eq('status', 'ACTIVE')
      .limit(1)
      .maybeSingle()

    if (activeSub) {
      const planBenefits = PLAN_BENEFITS[activeSub.plan] || []
      const periodStart = activeSub.current_period_start || activeSub.created_at
      const periodEnd = activeSub.current_period_end || now

      const { data: usages } = await supabaseAuth
        .from('club_benefit_usages')
        .select('benefit_key, used_at')
        .eq('subscription_id', activeSub.id)
        .gte('used_at', periodStart)
        .lte('used_at', periodEnd)

      const usageMap = new Map<string, string>()
      for (const u of usages || []) {
        usageMap.set(u.benefit_key, u.used_at)
      }

      premium = {
        is_premium: true,
        plan: activeSub.plan,
        subscription_id: activeSub.id,
        benefits: planBenefits.map(b => ({
          ...b,
          used: usageMap.has(b.key),
          used_at: usageMap.get(b.key) || null,
        })),
      }
    }

    // === COUPON INFO & REDEMPTION ===
    let coupon_redeemed = false
    let has_active_coupon = false

    // Check if customer has an active coupon
    const { data: activeCoupon } = await supabaseAuth
      .from('welcome_coupons')
      .select('id, status, percent_off')
      .eq('customer_id', customer.id)
      .eq('status', 'ACTIVE')
      .maybeSingle()

    if (activeCoupon) {
      has_active_coupon = true
    }

    if (redeem_coupon === true && activeCoupon) {
      await supabaseAuth
        .from('welcome_coupons')
        .update({ status: 'USED', used_at: now })
        .eq('id', activeCoupon.id)

      coupon_redeemed = true
      has_active_coupon = false

      // Audit log for coupon redemption
      await supabaseAuth
        .from('audit_logs')
        .insert({
          action: 'REDEEM_COUPON',
          actor_id: staffUser.id,
          actor_role: 'STAFF',
          entity: 'welcome_coupons',
          entity_id: activeCoupon.id,
          location_id,
          metadata: { customer_id: customer.id },
        })
    }

    return new Response(JSON.stringify({
      success: true,
      customer: { id: customer.id, name: `${customer.first_name} ${customer.last_name}` },
      visits_total: newVisits,
      points_balance: newPoints,
      points_added: pointsToAdd,
      points_detail: pointsDetail,
      unlocked_reward: unlockedReward,
      premium,
      has_active_coupon,
      coupon_redeemed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('verify-visit error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
