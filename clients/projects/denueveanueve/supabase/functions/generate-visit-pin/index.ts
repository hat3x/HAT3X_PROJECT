import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Verify staff token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: staffUser }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !staffUser) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check staff role
    const { data: roleData } = await supabase
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

    const { qr_token } = await req.json()

    if (!qr_token) {
      return new Response(JSON.stringify({ error: 'qr_token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up customer
    const { data: customer, error: custError } = await supabase
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

    // Expire any previous pending pins for this customer
    await supabase
      .from('visit_pins')
      .update({ status: 'EXPIRED' })
      .eq('customer_id', customer.id)
      .eq('status', 'PENDING')

    // Generate 4-digit PIN
    const pin = String(Math.floor(1000 + Math.random() * 9000))

    // Insert new pin (Realtime will notify the customer)
    const { error: insertError } = await supabase
      .from('visit_pins')
      .insert({
        customer_id: customer.id,
        pin,
        status: 'PENDING',
      })

    if (insertError) {
      return new Response(JSON.stringify({ error: 'Failed to generate PIN' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      success: true,
      pin,
      customer: { id: customer.id, name: `${customer.first_name} ${customer.last_name}` },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
