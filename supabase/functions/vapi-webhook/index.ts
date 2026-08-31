import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

// Location ID mapping
const LOCATION_MAP: Record<string, string> = {
  'collado-villalba': '4159c713-3507-49ba-8319-c4b7ed4f38b2',
  'alpedrete': '61865f3b-976b-427b-b5f1-c856e7b97cdf',
  '4159c713-3507-49ba-8319-c4b7ed4f38b2': '4159c713-3507-49ba-8319-c4b7ed4f38b2',
  '61865f3b-976b-427b-b5f1-c856e7b97cdf': '61865f3b-976b-427b-b5f1-c856e7b97cdf'
};

const LOCATION_NAMES: Record<string, string> = {
  '4159c713-3507-49ba-8319-c4b7ed4f38b2': 'Collado Villalba',
  '61865f3b-976b-427b-b5f1-c856e7b97cdf': 'Alpedrete'
};

interface RequestBody {
  action: 'find_customer' | 'check_availability' | 'create_appointment' | 'get_appointment' | 'cancel_appointment';
  customer_name?: string;
  customer_phone?: string;
  customer_id?: string;
  location_id?: string;
  staff_member_id?: string;
  date?: string;
  time?: string;
  services?: string[];
  appointment_id?: string;
  section?: 'CABALLEROS' | 'SENORAS';
}

async function findCustomer(customer_name: string, customer_phone?: string) {
  const searchTerms = customer_phone || customer_name;

  const { data, error } = await supabase
    .from('customers')
    .select('id, first_name, last_name, phone')
    .or(`first_name.ilike.%${customer_name}%,last_name.ilike.%${customer_name}%,phone.ilike.%${searchTerms}%`)
    .is('deleted_at', null)
    .limit(5);

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data || data.length === 0) {
    return {
      success: true,
      found: false,
      message: "No encontré ese cliente. ¿Podrías darme tu nombre completo o teléfono?"
    };
  }

  const customer = data[0];
  return {
    success: true,
    found: true,
    customer_id: customer.id,
    name: `${customer.first_name} ${customer.last_name}`,
    message: `Hola ${customer.first_name}, ¿en qué puedo ayudarte?`
  };
}

async function checkAvailability(location_id: string, date: string, time: string, section?: string) {
  const locationId = LOCATION_MAP[location_id] || location_id;

  // Get start and end times for the slot
  const startAt = new Date(`${date}T${time}:00`).toISOString();
  const endAt = new Date(`${date}T${time}:00`);
  endAt.setHours(endAt.getHours() + 1);
  const endAtISO = endAt.toISOString();

  // Get all active staff members for this location
  let staffQuery = supabase
    .from('staff_members')
    .select('id, name, section')
    .eq('location_id', locationId)
    .eq('active', true);

  if (section) {
    staffQuery = staffQuery.eq('section', section);
  }

  const { data: staff, error: staffError } = await staffQuery;

  if (staffError) {
    return { success: false, error: staffError.message };
  }

  if (!staff || staff.length === 0) {
    return {
      success: true,
      available: false,
      message: "No hay empleados configurados en esta ubicación."
    };
  }

  // Get appointments that overlap with this time slot
  const { data: appointments, error: aptError } = await supabase
    .from('appointments')
    .select('staff_member_id, start_at, end_at')
    .eq('location_id', locationId)
    .in('status', ['CONFIRMED', 'RESCHEDULED'])
    .lte('start_at', endAtISO)
    .gte('end_at', startAt);

  if (aptError) {
    return { success: false, error: aptError.message };
  }

  // Find which staff members are busy
  const busyStaffIds = new Set(appointments?.map(a => a.staff_member_id) || []);
  const availableStaff = staff.filter(s => !busyStaffIds.has(s.id));

  const dateStr = new Date(startAt).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  if (availableStaff.length === 0) {
    return {
      success: true,
      available: false,
      message: `Lo siento, el ${dateStr} a las ${time} no hay disponibilidad. ¿Quieres probar otro horario?`
    };
  }

  return {
    success: true,
    available: true,
    staff_available: availableStaff.map(s => ({ id: s.id, name: s.name })),
    message: `El ${dateStr} a las ${time} hay disponibilidad con: ${availableStaff.map(s => s.name).join(', ')}.`
  };
}

async function createAppointment(
  customer_id: string,
  location_id: string,
  date: string,
  time: string,
  staff_member_id?: string,
  services?: string[],
  section?: string
) {
  const locationId = LOCATION_MAP[location_id] || location_id;

  // Parse date and time
  const startAt = new Date(`${date}T${time}:00`).toISOString();
  const endAt = new Date(`${date}T${time}:00`);
  endAt.setHours(endAt.getHours() + 1);
  const endAtISO = endAt.toISOString();

  // If no staff member specified, find an available one
  let assignedStaffId = staff_member_id;
  let assignedStaffName: string | null = null;

  if (!assignedStaffId) {
    // Get all active staff members for this location
    let staffQuery = supabase
      .from('staff_members')
      .select('id, name, section')
      .eq('location_id', locationId)
      .eq('active', true);

    if (section) {
      staffQuery = staffQuery.eq('section', section);
    }

    const { data: staff } = await staffQuery;

    if (staff && staff.length > 0) {
      // Get appointments that overlap with this time slot
      const { data: appointments } = await supabase
        .from('appointments')
        .select('staff_member_id')
        .eq('location_id', locationId)
        .in('status', ['CONFIRMED', 'RESCHEDULED'])
        .lte('start_at', endAtISO)
        .gte('end_at', startAt);

      const busyStaffIds = new Set(appointments?.map(a => a.staff_member_id) || []);
      const availableStaff = staff.filter(s => !busyStaffIds.has(s.id));

      if (availableStaff.length > 0) {
        assignedStaffId = availableStaff[0].id;
        assignedStaffName = availableStaff[0].name;
      }
    }
  } else {
    // Get staff member name
    const { data: staffMember } = await supabase
      .from('staff_members')
      .select('name')
      .eq('id', assignedStaffId)
      .single();

    if (staffMember) {
      assignedStaffName = staffMember.name;
    }
  }

  // Create the appointment
  const { data: appointment, error } = await supabase
    .from('appointments')
    .insert({
      customer_id,
      location_id: locationId,
      staff_member_id: assignedStaffId,
      start_at: startAt,
      end_at: endAtISO,
      status: 'CONFIRMED'
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Sync with Google Calendar
  await syncWithGoogleCalendar(appointment.id, assignedStaffId, customer_id, locationId, startAt, endAtISO);

  // Get customer info for confirmation message
  const { data: customer } = await supabase
    .from('customers')
    .select('first_name')
    .eq('id', customer_id)
    .single();

  const dateStr = new Date(startAt).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const timeStr = new Date(startAt).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const staffMsg = assignedStaffName ? ` con ${assignedStaffName}` : '';

  return {
    success: true,
    appointment_id: appointment.id,
    message: `¡Cita reservada para el ${dateStr} a las ${timeStr}${staffMsg}! Te esperamos.`
  };
}

async function getAppointment(customer_id: string) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('appointments')
    .select('id, start_at, locations(name), staff_members(name)')
    .eq('customer_id', customer_id)
    .gte('start_at', now)
    .in('status', ['CONFIRMED', 'RESCHEDULED'])
    .order('start_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data) {
    return {
      success: true,
      found: false,
      message: "No tienes citas pendientes. ¿Quieres reservar una?"
    };
  }

  const dateStr = new Date(data.start_at).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const timeStr = new Date(data.start_at).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit'
  });
  const staffMsg = data.staff_members?.name ? ` con ${data.staff_members.name}` : '';

  return {
    success: true,
    found: true,
    appointment_id: data.id,
    message: `Tu próxima cita es el ${dateStr} a las ${timeStr} en ${data.locations?.name}${staffMsg}.`
  };
}

async function cancelAppointment(appointment_id: string) {
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'CANCELLED' })
    .eq('id', appointment_id);

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    message: "Cita cancelada correctamente. ¿Hay algo más en lo que pueda ayudarte?"
  };
}

async function syncWithGoogleCalendar(
  appointment_id: string,
  staff_member_id: string | undefined,
  customer_id: string,
  location_id: string,
  start_at: string,
  end_at: string
) {
  try {
    // Get customer info for event title
    const { data: customer } = await supabase
      .from('customers')
      .select('first_name, last_name, phone')
      .eq('id', customer_id)
      .single();

    // Call the gcal-sync-appointments Edge Function
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const syncResponse = await fetch(`${supabaseUrl}/functions/v1/gcal-sync-appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
      },
      body: JSON.stringify({
        action: 'create',
        appointment_id,
        staff_member_id,
        customer_name: customer ? `${customer.first_name} ${customer.last_name}` : 'Cliente',
        customer_phone: customer?.phone,
        start_at,
        end_at,
        location_id
      })
    });

    if (!syncResponse.ok) {
      console.error('Google Calendar sync failed:', await syncResponse.text());
      return { synced: false };
    }

    const result = await syncResponse.json();
    console.log('Google Calendar sync result:', result);
    return { synced: true, event_id: result.event_id };

  } catch (error) {
    console.error('Error syncing with Google Calendar:', error);
    return { synced: false, error: error.message };
  }
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();

    let result;

    switch (body.action) {
      case 'find_customer':
        result = await findCustomer(body.customer_name || '', body.customer_phone);
        break;

      case 'check_availability':
        result = await checkAvailability(
          body.location_id || '',
          body.date || '',
          body.time || '',
          body.section
        );
        break;

      case 'create_appointment':
        result = await createAppointment(
          body.customer_id || '',
          body.location_id || '',
          body.date || '',
          body.time || '',
          body.staff_member_id,
          body.services,
          body.section
        );
        break;

      case 'get_appointment':
        result = await getAppointment(body.customer_id || '');
        break;

      case 'cancel_appointment':
        result = await cancelAppointment(body.appointment_id || '');
        break;

      default:
        result = { success: false, error: 'Acción no válida' };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});