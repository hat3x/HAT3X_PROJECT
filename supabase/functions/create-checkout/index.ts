import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@18.5.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const PRICE_MAP: Record<string, { monthly: string; annual: string }> = {
  LADIES_39: {
    monthly: 'price_1TCjDWIsEUPwjqgmwaOeqUa1',
    annual: 'price_1TCjDsIsEUPwjqgmYAGHgWS8',
  },
  MEN_19: {
    monthly: 'price_1TCjEDIsEUPwjqgm6Hg5haVZ',
    annual: 'price_1TCjEjIsEUPwjqgmsmB9Ckt7',
  },
  MEN_17: {
    monthly: 'price_1TCjFGIsEUPwjqgmi9OYw8NA',
    annual: 'price_1TCjFXIsEUPwjqgmzPzWMkXc',
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!

    const supabaseClient = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !user?.email) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { plan, price_cents, billing_period } = await req.json()
    if (!plan || !price_cents) {
      return new Response(JSON.stringify({ error: 'plan and price_cents required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const period = billing_period === 'annual' ? 'annual' : 'monthly'
    const priceEntry = PRICE_MAP[plan]
    if (!priceEntry) {
      return new Response(JSON.stringify({ error: `Unknown plan: ${plan}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const priceId = priceEntry[period]

    const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' })

    const customers = await stripe.customers.list({ email: user.email, limit: 1 })
    let customerId: string | undefined
    if (customers.data.length > 0) {
      customerId = customers.data[0].id
    }

    const origin = req.headers.get('origin') || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      payment_method_types: ['card', 'paypal'],
      success_url: `${origin}/club?checkout=success`,
      cancel_url: `${origin}/club?checkout=cancel`,
      metadata: { plan, user_id: user.id, billing_period: period },
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('create-checkout error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
