/**
 * retell-webhook — Edge Function
 * Backend entre Retell AI y Supabase para el asistente de voz de De Nueve a Nueve.
 *
 * Acciones soportadas (via header x-retell-action):
 *  - check_availability
 *  - get_customer_by_phone
 *  - get_appointment
 *  - create_appointment
 *  - cancel_appointment
 *  - get_loyalty
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retell-action',
};

// Duraciones de servicios por nombre (minutos) — sincronizar con la DB
const SERVICE_DURATIONS: Record<string, number> = {
  'Corte Caballero': 30,
  'Corte Moda': 30,
  'Corte Básico': 30,
  'Corte Señora': 45,
  'Color Raíz': 60,
  'Mechas': 90,
  'Peinado': 40,
  'Tratamiento Keratina': 90,
  'Lavado + Secado': 20,
  'Manicura': 30,
  'Pedicura': 45,
  'Servicio Estrella': 120,
};

const ok = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const err = (message: string, status = 400) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const action = req.headers.get('x-retell-action');
  if (!action) return err('Missing x-retell-action header');

  // Usar service_role para acceso completo desde el backend
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // body vacío permitido en algunas acciones
  }

  // ─────────────────────────────────────────────
  // ACTION: check_availability
  // ─────────────────────────────────────────────
  if (action === 'check_availability') {
    const { date, section, duration_minutes } = body as {
      date: string;
      section: string;
      duration_minutes: number;
    };

    // Obtener localizaciones activas
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name');

    if (!locations?.length) {
      return ok({ available: false, message: 'No hay centros disponibles' });
    }

    // Calcular slots disponibles: cada 30 min entre apertura y cierre
    // Horario fijo: L-V 10:00-20:00, S 9:00-15:00
    const dayOfWeek = new Date(date).getDay(); // 0=Dom, 6=Sab
    const isSaturday = dayOfWeek === 6;
    const isSunday = dayOfWeek === 0;

    if (isSunday) {
      return ok({ available: false, message: 'Los domingos estamos cerrados' });
    }

    const openHour = isSaturday ? 9 : 10;
    const closeHour = isSaturday ? 15 : 20;

    // Obtener citas ya reservadas para ese día en todas las ubicaciones
    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;

    const { data: existingApts } = await supabase
      .from('appointments')
      .select('start_at, end_at, location_id')
      .in('status', ['CONFIRMED', 'RESCHEDULED'])
      .gte('start_at', dayStart)
      .lte('start_at', dayEnd);

    // Generar slots cada 30 min
    const slots: string[] = [];
    for (let h = openHour; h < closeHour; h++) {
      for (const m of [0, 30]) {
        const slotStart = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
        const slotEnd = new Date(slotStart.getTime() + duration_minutes * 60000);

        // No ofrecer slots que terminen después del cierre
        if (slotEnd.getHours() > closeHour || (slotEnd.getHours() === closeHour && slotEnd.getMinutes() > 0)) continue;

        // Verificar que no hay solapamiento con citas existentes
        const hasOverlap = (existingApts || []).some((apt) => {
          const aptStart = new Date(apt.start_at);
          const aptEnd = new Date(apt.end_at);
          return slotStart < aptEnd && slotEnd > aptStart;
        });

        if (!hasOverlap) {
          slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
      }
    }

    if (!slots.length) {
      return ok({
        available: false,
        message: `No hay huecos disponibles el ${date} para ${duration_minutes} minutos`,
      });
    }

    // Devolver los primeros 6 slots disponibles para que el agente los ofrezca
    return ok({
      available: true,
      date,
      slots: slots.slice(0, 6),
      message: `Hay disponibilidad el ${date}. Los primeros huecos son: ${slots.slice(0, 3).join(', ')}`,
    });
  }

  // ─────────────────────────────────────────────
  // ACTION: get_customer_by_phone
  // ─────────────────────────────────────────────
  if (action === 'get_customer_by_phone') {
    const { phone } = body as { phone: string };

    // Normalizar teléfono: quitar espacios y guiones
    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');

    const { data: customer } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email, phone, status')
      .eq('phone', normalizedPhone)
      .single();

    if (!customer) {
      return ok({
        found: false,
        message: 'No encontré ningún cliente registrado con ese teléfono. ¿Quizás está registrado con otro número?',
      });
    }

    if (customer.status === 'DISABLED') {
      return ok({ found: false, message: 'Esta cuenta está desactivada. Contacta con el salón.' });
    }

    return ok({
      found: true,
      customer_id: customer.id,
      first_name: customer.first_name,
      full_name: `${customer.first_name} ${customer.last_name}`,
    });
  }

  // ─────────────────────────────────────────────
  // ACTION: get_appointment
  // ─────────────────────────────────────────────
  if (action === 'get_appointment') {
    const { customer_id } = body as { customer_id: string };

    const now = new Date().toISOString();
    const { data: appointment } = await supabase
      .from('appointments')
      .select('id, start_at, end_at, status, notes, locations(name), appointment_services(service_name_snapshot)')
      .eq('customer_id', customer_id)
      .in('status', ['CONFIRMED', 'RESCHEDULED'])
      .gte('start_at', now)
      .order('start_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!appointment) {
      return ok({ found: false, message: 'No tienes ninguna cita activa en este momento.' });
    }

    const startDate = new Date(appointment.start_at);
    const dateStr = startDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const timeStr = startDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const services = (appointment.appointment_services as { service_name_snapshot: string }[])
      .map((s) => s.service_name_snapshot)
      .join(', ');
    const location = (appointment.locations as { name: string } | null)?.name || 'el salón';

    return ok({
      found: true,
      appointment_id: appointment.id,
      status: appointment.status,
      date_readable: `${dateStr} a las ${timeStr}`,
      location,
      services,
      message: `Tienes cita el ${dateStr} a las ${timeStr} en ${location} para ${services || 'tu servicio'}. Estado: ${appointment.status === 'RESCHEDULED' ? 'reprogramada' : 'confirmada'}.`,
    });
  }

  // ─────────────────────────────────────────────
  // ACTION: create_appointment
  // ─────────────────────────────────────────────
  if (action === 'create_appointment') {
    const { customer_id, section, service_names, start_datetime, notes } = body as {
      customer_id: string;
      section: string;
      service_names: string[];
      start_datetime: string;
      notes?: string;
    };

    // Verificar que no tiene cita activa
    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from('appointments')
      .select('id')
      .eq('customer_id', customer_id)
      .in('status', ['CONFIRMED', 'RESCHEDULED'])
      .gte('start_at', now)
      .maybeSingle();

    if (existing) {
      return ok({
        success: false,
        message: 'Ya tienes una cita activa. Cancélala primero para poder reservar otra.',
      });
    }

    // Calcular duración total
    const totalMin = service_names.reduce((sum, name) => sum + (SERVICE_DURATIONS[name] || 30), 0);
    const startAt = new Date(start_datetime);
    const endAt = new Date(startAt.getTime() + totalMin * 60000);

    // Obtener primera localización activa
    const { data: location } = await supabase
      .from('locations')
      .select('id')
      .limit(1)
      .single();

    if (!location) return err('No hay centros disponibles', 500);

    // Crear cita
    const { data: appointment, error: aptError } = await supabase
      .from('appointments')
      .insert({
        customer_id,
        location_id: location.id,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        status: 'CONFIRMED',
        notes: notes || null,
        estimated_total_duration: totalMin,
      })
      .select('id')
      .single();

    if (aptError || !appointment) {
      return err('No se pudo crear la cita. Inténtalo de nuevo.', 500);
    }

    // Buscar servicios por nombre y crear appointment_services
    if (service_names.length > 0) {
      const { data: services } = await supabase
        .from('services')
        .select('id, name, fixed_points')
        .in('name', service_names);

      if (services?.length) {
        const appointmentServices = services.map((s) => ({
          appointment_id: appointment.id,
          service_id: s.id,
          service_name_snapshot: s.name,
          points_snapshot: s.fixed_points || 0,
        }));

        await supabase.from('appointment_services').insert(appointmentServices);
      }
    }

    const dateStr = startAt.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const timeStr = startAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    return ok({
      success: true,
      appointment_id: appointment.id,
      message: `¡Perfecto! Cita confirmada para el ${dateStr} a las ${timeStr} para ${service_names.join(' y ')}. ¡Te esperamos!`,
    });
  }

  // ─────────────────────────────────────────────
  // ACTION: cancel_appointment
  // ─────────────────────────────────────────────
  if (action === 'cancel_appointment') {
    const { appointment_id, customer_id } = body as {
      appointment_id: string;
      customer_id: string;
    };

    // Verificar que la cita pertenece al cliente
    const { data: apt } = await supabase
      .from('appointments')
      .select('id, start_at, status')
      .eq('id', appointment_id)
      .eq('customer_id', customer_id)
      .in('status', ['CONFIRMED', 'RESCHEDULED'])
      .single();

    if (!apt) {
      return ok({ success: false, message: 'No encontré la cita o ya ha sido cancelada.' });
    }

    const { error } = await supabase
      .from('appointments')
      .update({ status: 'CANCELLED' })
      .eq('id', appointment_id);

    if (error) return err('No se pudo cancelar la cita.', 500);

    // Sync GCal en background (no bloquea)
    supabase.functions
      .invoke('gcal-sync-appointments', { body: { action: 'delete', appointment_id } })
      .catch(() => {});

    return ok({ success: true, message: 'Tu cita ha sido cancelada correctamente. Cuando quieras reservar de nuevo, aquí estamos.' });
  }

  // ─────────────────────────────────────────────
  // ACTION: get_loyalty
  // ─────────────────────────────────────────────
  if (action === 'get_loyalty') {
    const { customer_id } = body as { customer_id: string };

    const { data: account } = await supabase
      .from('loyalty_accounts')
      .select('points_balance, visits_total, last_visit_at')
      .eq('customer_id', customer_id)
      .single();

    if (!account) {
      return ok({ found: false, message: 'No encontré información de fidelización para este cliente.' });
    }

    // Calcular próximo hito
    const milestones = [
      { visits: 3, reward: 'diagnóstico capilar gratis' },
      { visits: 5, reward: 'tratamiento express gratis' },
      { visits: 8, reward: 'vale de producto' },
      { visits: 10, reward: 'upgrade de pack' },
    ];

    const nextMilestone = milestones.find((m) => m.visits > account.visits_total);
    const visitsToNext = nextMilestone ? nextMilestone.visits - account.visits_total : 0;

    let milestoneMsg = '';
    if (nextMilestone) {
      milestoneMsg = visitsToNext === 1
        ? `¡Solo te falta 1 visita para conseguir ${nextMilestone.reward}!`
        : `Te faltan ${visitsToNext} visitas para conseguir ${nextMilestone.reward}.`;
    } else {
      milestoneMsg = '¡Has completado todos los hitos del programa de fidelización!';
    }

    return ok({
      found: true,
      points: account.points_balance,
      visits: account.visits_total,
      message: `Tienes ${account.points_balance} puntos y ${account.visits_total} visitas. ${milestoneMsg}`,
    });
  }

  return err(`Acción desconocida: ${action}`);
});
