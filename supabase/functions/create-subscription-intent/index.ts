import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@18.5.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

// Map plan + billing period to real Stripe price IDs
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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

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

    // Find or create Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 })
    let customerId: string
    if (customers.data.length > 0) {
      customerId = customers.data[0].id
    } else {
      const newCustomer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      })
      customerId = newCustomer.id
    }

    // Create subscription with the real price ID
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card', 'paypal', 'link'],
      },
      metadata: { plan, user_id: user.id, billing_period: period },
      expand: ['latest_invoice.payment_intent'],
    })

    // Extract client secret
    const invoice = subscription.latest_invoice as any
    let clientSecret: string | null = invoice?.payment_intent?.client_secret || null

    // Fallback: retrieve invoice separately if PI not expanded
    if (!clientSecret && invoice?.id) {
      console.log('PI not in expand, retrieving invoice separately', { invoiceId: invoice.id })
      const freshInvoice = await stripe.invoices.retrieve(invoice.id, {
        expand: ['payment_intent'],
      })
      const pi = freshInvoice.payment_intent as any
      clientSecret = pi?.client_secret || null

      // Last resort: create a PaymentIntent manually for the invoice amount
      if (!clientSecret) {
        console.log('No PI on invoice, creating manually', { invoiceId: invoice.id, total: freshInvoice.amount_due })
        const manualPI = await stripe.paymentIntents.create({
          amount: freshInvoice.amount_due,
          currency: freshInvoice.currency,
          customer: customerId,
          metadata: {
            invoice_id: invoice.id,
            subscription_id: subscription.id,
            plan,
            user_id: user.id,
          },
        })
        clientSecret = manualPI.client_secret
      }
    }

    if (!clientSecret) {
      console.error('Could not obtain client_secret', {
        subscriptionId: subscription.id,
        invoiceId: invoice?.id,
        invoiceStatus: invoice?.status,
        piStatus: invoice?.payment_intent?.status,
      })
      throw new Error('Could not obtain payment client secret')
    }

    // Upsert subscription in our DB
    const { data: customer } = await supabaseClient
      .from('customers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (customer) {
      await supabaseClient
        .from('subscriptions')
        .upsert({
          customer_id: customer.id,
          plan: plan,
          price_cents: price_cents,
          currency: 'EUR',
          status: 'PAYMENT_DUE',
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          current_period_start: subscription.current_period_start ? new Date(typeof subscription.current_period_start === 'number' ? subscription.current_period_start * 1000 : subscription.current_period_start).toISOString() : null,
          current_period_end: subscription.current_period_end ? new Date(typeof subscription.current_period_end === 'number' ? subscription.current_period_end * 1000 : subscription.current_period_end).toISOString() : null,
          next_renewal_at: subscription.current_period_end ? new Date(typeof subscription.current_period_end === 'number' ? subscription.current_period_end * 1000 : subscription.current_period_end).toISOString() : null,
        }, {
          onConflict: 'customer_id',
          ignoreDuplicates: false,
        })
    }

    return new Response(JSON.stringify({
      subscriptionId: subscription.id,
      clientSecret,
      customerId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('create-subscription-intent error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
