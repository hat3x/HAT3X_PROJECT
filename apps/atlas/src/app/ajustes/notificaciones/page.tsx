import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { Dispositivos } from "@/components/ajustes/Dispositivos";

export default async function PaginaNotificaciones() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  if (!perfil) redirect("/login");

  // Solo endpoint y nombre: `p256dh` y `auth` no pintan nada en pantalla y no
  // tienen por qué salir de la base.
  const { data } = await sb
    .from("suscripciones_push")
    .select("endpoint, dispositivo")
    .eq("usuario_id", perfil.id);

  // La pública es pública: su cometido es viajar al navegador. La privada vive
  // en el entorno de la Edge Function y no aparece por aquí.
  const clavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLICA ?? "";

  return (
    <section className="max-w-3xl space-y-4">
      <header>
        <Link
          href="/ajustes"
          className="mb-2 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100"
        >
          <ChevronLeft size={15} aria-hidden="true" />
          Ajustes
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Notificaciones</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Cada dispositivo se registra por separado. Recibirás avisos de los
          proyectos a los que tengas acceso.
        </p>
      </header>

      <Dispositivos suscritos={data ?? []} clavePublica={clavePublica} />

      <p className="text-xs" style={{ color: "var(--texto-tenue)" }}>
        Mientras Atlas corra en tu ordenador, las notificaciones llegan a este
        navegador. Al móvil solo llegarán cuando esté publicado en un dominio con
        HTTPS: tu teléfono no puede registrar un service worker contra una dirección
        local.
      </p>
    </section>
  );
}
