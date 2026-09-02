import { NextResponse, type NextRequest } from "next/server";

import { buildPrescriptionPdf } from "@/lib/dental/prescription-pdf";
import { getActiveSalon } from "@/lib/salon";
import { createClient } from "@/lib/supabase/server";

/**
 * Receta imprimible (PDF).
 *
 * `GET /api/recetas/[id]` reconstruye la receta desde su registro y la devuelve
 * como PDF. El navegador lo abre en su visor, y de ahí se imprime con la ventana
 * del sistema —que es donde se elige la impresora: una página web no puede ver
 * las impresoras del ordenador—.
 *
 * ── POR QUÉ SE GENERA AL VUELO Y NO SE ARCHIVA ──────────────────────────────
 * A diferencia del consentimiento, que se sella al firmar porque hay que poder
 * demostrar QUÉ texto se firmó, la receta ya es inmutable en la base: el trigger
 * `prescription_guard` impide tocarla una vez emitida. Reconstruirla da siempre
 * el mismo documento, así que archivarlo solo añadiría un sitio más donde algo
 * puede quedarse desincronizado.
 *
 * Aislado por `salon_id`: una receta de otra clínica sencillamente no se
 * encuentra.
 */
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

/**
 * Forma de la fila con sus relaciones.
 *
 * Se declara a mano porque los tipos generados no resuelven los `select`
 * anidados de esta tabla —igual que en `fetchPatientInvoices`—, y sin esto
 * TypeScript infiere un error de PostgREST en lugar de la fila.
 */
interface FilaReceta {
  id: string;
  status: string;
  issued_at: string | null;
  diagnosis: string | null;
  notes: string | null;
  prescriber_name: string | null;
  prescriber_license: string | null;
  prescriber_authority: string | null;
  prescriber_address: string | null;
  prescriber_email: string | null;
  prescriber_phone: string | null;
  customers: { full_name: string; tax_id: string | null; birth_date: string | null } | null;
  prescription_item: {
    position: number;
    medication: string;
    active_ingredient: string | null;
    pharmaceutical_form: string | null;
    route: string | null;
    dose: string | null;
    units_per_package: string | null;
    frequency: string | null;
    duration: string | null;
    quantity: string | null;
    instructions: string | null;
  }[] | null;
}

function htmlError(message: string, status: number): NextResponse {
  const body = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Receta</title></head><body style="font-family:system-ui;padding:2rem;color:#0f172a"><p>${message}</p></body></html>`;
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const salon = await getActiveSalon();
  if (salon === null) {
    return htmlError("No tienes un salón asignado o la sesión ha caducado.", 403);
  }

  const supabase = createClient();

  const { data: filas, error } = await supabase
    .from("prescription")
    .select(
      "id, status, issued_at, diagnosis, notes, prescriber_name, prescriber_license, prescriber_authority, " +
        "prescriber_address, prescriber_email, prescriber_phone, " +
        "customers(full_name, tax_id, birth_date), " +
        "prescription_item(position, medication, active_ingredient, pharmaceutical_form, route, dose, units_per_package, frequency, duration, quantity, instructions)",
    )
    .eq("id", params.id)
    .eq("salon_id", salon.id)
    .limit(1)
    .returns<FilaReceta[]>();

  if (error !== null) {
    return htmlError(`No se pudo cargar la receta: ${error.message}`, 500);
  }
  const receta = filas?.[0] ?? null;
  if (receta === null) {
    return htmlError("La receta no existe o no es accesible.", 404);
  }

  const { data: fiscal } = await supabase
    .from("salons")
    .select("tax_id, fiscal_address")
    .eq("id", salon.id)
    .maybeSingle();

  // El orden de los renglones es el que puso el prescriptor: una pauta se lee
  // en orden, y barajarla cambia lo que el paciente entiende.
  const renglones = [...(receta.prescription_item ?? [])].sort(
    (a, b) => a.position - b.position,
  );

  const pdf = await buildPrescriptionPdf({
    salonName: salon.name,
    salonTaxId: fiscal?.tax_id ?? null,
    salonAddress: fiscal?.fiscal_address ?? null,
    patientName: receta.customers?.full_name ?? "—",
    patientTaxId: receta.customers?.tax_id ?? null,
    patientBirthDate: receta.customers?.birth_date ?? null,
    prescriberName: receta.prescriber_name,
    prescriberLicense: receta.prescriber_license,
    prescriberAuthority: receta.prescriber_authority,
    prescriberAddress: receta.prescriber_address,
    prescriberEmail: receta.prescriber_email,
    prescriberPhone: receta.prescriber_phone,
    diagnosis: receta.diagnosis,
    notes: receta.notes,
    issuedAt: receta.issued_at,
    medications: renglones.map((r) => ({
      medication: r.medication,
      activeIngredient: r.active_ingredient,
      pharmaceuticalForm: r.pharmaceutical_form,
      route: r.route,
      dose: r.dose,
      unitsPerPackage: r.units_per_package,
      frequency: r.frequency,
      duration: r.duration,
      quantity: r.quantity,
      instructions: r.instructions,
    })),
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      // `inline`: se abre en el visor del navegador en vez de descargarse, que
      // es desde donde se imprime sin pasos de más.
      "Content-Disposition": `inline; filename="receta-${receta.id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
