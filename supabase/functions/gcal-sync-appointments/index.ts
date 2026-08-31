import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const enc = (obj: any) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const unsignedToken = `${enc(header)}.${enc(claim)}`

  const pemBody = serviceAccount.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(unsignedToken)
  )

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${unsignedToken}.${sig}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) throw new Error(`Token error: ${JSON.stringify(tokenData)}`)
  return tokenData.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate token using anon client with user's auth header
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(token)
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use service role client for DB operations
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const body = await req.json()
    const { action, appointment_id } = body

    if (action === 'create' || action === 'update') {
      // Get appointment with staff and customer info
      const { data: appt, error: apptErr } = await supabase
        .from('appointments')
        .select('*, customers(first_name, last_name, phone, email), staff_members(name), appointment_services(service_name_snapshot, duration_minutes_snapshot, unit_price_snapshot, price_type_snapshot, quantity)')
        .eq('id', appointment_id)
        .single()

      if (apptErr || !appt) {
        return new Response(JSON.stringify({ error: 'Appointment not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!appt.staff_member_id) {
        return new Response(JSON.stringify({ success: true, skipped: 'No staff assigned' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Get calendar mapping
      const { data: mapping } = await supabase
        .from('staff_calendar_mappings')
        .select('google_calendar_id')
        .eq('staff_member_id', appt.staff_member_id)
        .single()

      if (!mapping) {
        return new Response(JSON.stringify({ success: true, skipped: 'No calendar mapped' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let cleanJson = saJson.trim()
      if (cleanJson.startsWith('"') && cleanJson.endsWith('"')) {
        cleanJson = JSON.parse(cleanJson)
      }
      const serviceAccount = typeof cleanJson === 'string' ? JSON.parse(cleanJson) : cleanJson
      const accessToken = await getAccessToken(serviceAccount)

      const customer = appt.customers as any
      const apptServices = (appt.appointment_services as any[]) || []
      const servicesSummary = apptServices
        .filter((s: any) => s.service_name_snapshot)
        .map((s: any) => s.service_name_snapshot)
        .join(', ') || 'Cita'
      const servicesDetail = apptServices
        .filter((s: any) => s.service_name_snapshot)
        .map((s: any) => {
          const dur = s.duration_minutes_snapshot ? ` (${s.duration_minutes_snapshot} min)` : ''
          const price = s.price_type_snapshot === 'on_request' ? ' - Consultar' : s.unit_price_snapshot ? ` - ${s.unit_price_snapshot} €` : ''
          return `• ${s.service_name_snapshot}${dur}${price}`
        })
        .join('\n') || 'Sin servicios'
      const totalDuration = appt.estimated_total_duration ? `${appt.estimated_total_duration} min` : ''

      const event = {
        summary: `${customer?.first_name} ${customer?.last_name} - ${servicesSummary}`,
        description: `Cliente: ${customer?.first_name} ${customer?.last_name}\nTeléfono: ${customer?.phone || ''}\nEmail: ${customer?.email || ''}\n\nServicios:\n${servicesDetail}\n\nDuración total: ${totalDuration}\nNotas: ${appt.customer_notes || ''}`,
        start: { dateTime: appt.start_at, timeZone: 'Europe/Madrid' },
        end: { dateTime: appt.end_at, timeZone: 'Europe/Madrid' },
        extendedProperties: {
          private: { supabase_appointment_id: appointment_id },
        },
      }

      const calendarId = encodeURIComponent(mapping.google_calendar_id)

      if (action === 'create') {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
          }
        )
        const gcalEvent = await res.json()
        if (!res.ok) throw new Error(`GCal create failed: ${JSON.stringify(gcalEvent)}`)

        // Store gcal event id in appointment metadata (using staff_notes for now)
        await supabase.from('appointments').update({
          staff_notes: JSON.stringify({ ...(appt.staff_notes ? JSON.parse(appt.staff_notes) : {}), gcal_event_id: gcalEvent.id }),
        }).eq('id', appointment_id)

        return new Response(JSON.stringify({ success: true, gcal_event_id: gcalEvent.id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (action === 'update') {
        // Find existing gcal event
        let gcalEventId = null
        try {
          const notes = appt.staff_notes ? JSON.parse(appt.staff_notes) : {}
          gcalEventId = notes.gcal_event_id
        } catch {}

        if (gcalEventId) {
          const res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${gcalEventId}`,
            {
              method: 'PUT',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(event),
            }
          )
          if (!res.ok) {
            const err = await res.json()
            throw new Error(`GCal update failed: ${JSON.stringify(err)}`)
          }
        } else {
          // No existing event, create new
          const res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(event),
            }
          )
          const gcalEvent = await res.json()
          if (!res.ok) throw new Error(`GCal create failed: ${JSON.stringify(gcalEvent)}`)
          await supabase.from('appointments').update({
            staff_notes: JSON.stringify({ gcal_event_id: gcalEvent.id }),
          }).eq('id', appointment_id)
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (action === 'delete') {
      const { data: appt } = await supabase
        .from('appointments')
        .select('staff_member_id, staff_notes')
        .eq('id', appointment_id)
        .single()

      if (!appt?.staff_member_id) {
        return new Response(JSON.stringify({ success: true, skipped: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: mapping } = await supabase
        .from('staff_calendar_mappings')
        .select('google_calendar_id')
        .eq('staff_member_id', appt.staff_member_id)
        .single()

      let gcalEventId = null
      try {
        const notes = appt.staff_notes ? JSON.parse(appt.staff_notes) : {}
        gcalEventId = notes.gcal_event_id
      } catch {}

      if (mapping && gcalEventId) {
        let cleanJson2 = saJson.trim()
        if (cleanJson2.startsWith('"') && cleanJson2.endsWith('"')) {
          cleanJson2 = JSON.parse(cleanJson2)
        }
        const serviceAccount = typeof cleanJson2 === 'string' ? JSON.parse(cleanJson2) : cleanJson2
        const accessToken = await getAccessToken(serviceAccount)
        const calendarId = encodeURIComponent(mapping.google_calendar_id)
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${gcalEventId}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        )
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'check-availability') {
      const { staff_member_id, date } = body

      // 1. Get booked appointments with service phase data
      const dayStart = `${date}T00:00:00`
      const dayEnd = `${date}T23:59:59`
      const { data: existingAppts } = await supabase
        .from('appointments')
        .select('start_at, end_at, appointment_services(service_id, services(application_min, exposure_min, post_exposure_min, duration_min))')
        .eq('staff_member_id', staff_member_id)
        .gte('start_at', dayStart)
        .lte('start_at', dayEnd)
        .in('status', ['CONFIRMED', 'RESCHEDULED'])

      const busySlots: { start: string; end: string; source: string }[] = []

      for (const appt of (existingAppts || [])) {
        const svcs = (appt.appointment_services || []) as any[]
        const phasedSvcs = svcs.filter((s: any) => s.services?.application_min && s.services?.exposure_min)

        if (phasedSvcs.length > 0) {
          // Compute active work windows, freeing exposure time
          const totalApp = phasedSvcs.reduce((sum: number, s: any) => sum + (s.services.application_min || 0), 0)
          const maxExposure = Math.max(...phasedSvcs.map((s: any) => s.services.exposure_min || 0))
          const totalPost = svcs.reduce((sum: number, s: any) => {
            if (s.services?.post_exposure_min) return sum + s.services.post_exposure_min
            if (!s.services?.application_min) return sum + (s.services?.duration_min || 0)
            return sum
          }, 0)
          // Non-phased services add to application block
          const nonPhasedDur = svcs
            .filter((s: any) => !s.services?.application_min || !s.services?.exposure_min)
            .filter((s: any) => !s.services?.post_exposure_min)
            .reduce((sum: number, s: any) => sum + (s.services?.duration_min || 0), 0)

          const start = new Date(appt.start_at).getTime()
          const appEnd = start + (totalApp + nonPhasedDur) * 60000
          const postStart = appEnd + maxExposure * 60000

          // Application phase → BUSY
          busySlots.push({ start: appt.start_at, end: new Date(appEnd).toISOString(), source: 'db' })
          // Post-exposure phase → BUSY (only if there's post work)
          if (totalPost > 0) {
            busySlots.push({ start: new Date(postStart).toISOString(), end: appt.end_at, source: 'db' })
          }
        } else {
          // No phases → full block busy
          busySlots.push({ start: appt.start_at, end: appt.end_at, source: 'db' })
        }
      }

      // 2. Get Google Calendar busy slots
      const { data: mapping } = await supabase
        .from('staff_calendar_mappings')
        .select('google_calendar_id')
        .eq('staff_member_id', staff_member_id)
        .single()

      if (mapping) {
        try {
          let cleanJsonAvail = saJson.trim()
          if (cleanJsonAvail.startsWith('"') && cleanJsonAvail.endsWith('"')) {
            cleanJsonAvail = JSON.parse(cleanJsonAvail)
          }
          const serviceAccount = typeof cleanJsonAvail === 'string' ? JSON.parse(cleanJsonAvail) : cleanJsonAvail
          const accessToken = await getAccessToken(serviceAccount)
          const calendarId = encodeURIComponent(mapping.google_calendar_id)

          const timeMin = `${date}T00:00:00+01:00`
          const timeMax = `${date}T23:59:59+01:00`

          const res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          const data = await res.json()

          ;(data.items || [])
            .filter((e: any) => e.status !== 'cancelled')
            .filter((e: any) => {
              // Exclude events created by our system (already handled with phase-aware logic from DB)
              const supabaseId = e.extendedProperties?.private?.supabase_appointment_id
              return !supabaseId
            })
            .forEach((e: any) => {
              busySlots.push({
                start: e.start?.dateTime || e.start?.date,
                end: e.end?.dateTime || e.end?.date,
                source: 'gcal',
              })
            })
        } catch (gcalErr) {
          console.warn('GCal availability check failed (non-blocking):', gcalErr)
        }
      }

      return new Response(JSON.stringify({ busy_slots: busySlots }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('gcal-sync error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
