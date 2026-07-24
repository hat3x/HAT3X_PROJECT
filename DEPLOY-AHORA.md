# DEPLOY-AHORA — Salón OS (checklist concreta)

Guía copia-y-pega para el **primer despliegue** de Salón OS a producción.
Complementa a `DEPLOYMENT.md` (referencia genérica del pipeline); esto es tu
checklist con los valores reales.

> ⚠️ **Antes de dar de alta clientes reales**, dos cosas obligatorias:
> 1. **Twilio** configurado en Supabase (Paso 4) — sin él, nadie puede registrarse (OTP).
> 2. **Veri*factu validado por tu gestoría** — no factures en real hasta el visto bueno.

Tus valores:
- **Supabase URL:** `https://jztoyekixcziaicrnlce.supabase.co`
- **Project ref:** `jztoyekixcziaicrnlce`
- **Anon key** y **service_role key:** cópialas de `clients/projects/salon-os/.env.local`
  (nunca las pegues en un sitio público; la `service_role` es SECRETA).

---

## Paso 1 — Repositorio remoto (no existe aún)

Salón OS es hoy un repo git solo local. Necesita un remoto.

**Opción A — con GitHub CLI** (si instalas `gh`):
```bash
cd clients/projects/salon-os
gh repo create hat3x/salon-os --private --source=. --push
```

**Opción B — por la web** (gh no está instalado):
1. Crea un repo **privado** vacío en https://github.com/new (nómbralo `salon-os`, sin README).
2. Luego:
```bash
cd clients/projects/salon-os
git remote add origin https://github.com/hat3x/salon-os.git
git push -u origin HEAD
```

> Nota: hay una rama de trabajo activa (`hat3x/HAT3X-0xx`). Antes de desplegar,
> decide tu rama de producción (normalmente `main`) y fusiona ahí lo que quieras
> publicar. Revisa `git status` y `git branch` antes del push.

---

## Paso 2 — Vercel: login + vincular proyecto

```bash
npm i -g vercel        # si no lo tienes
cd clients/projects/salon-os
vercel login           # abre el navegador — hazlo tú
vercel link            # crea/vincula el proyecto (genera .vercel/)
```

---

## Paso 3 — Variables de entorno en Vercel (entorno Production)

En el panel de Vercel → Project → Settings → Environment Variables, añade:

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jztoyekixcziaicrnlce.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(copia de tu `.env.local`)* |
| `SUPABASE_SERVICE_ROLE_KEY` | *(copia de tu `.env.local` — SOLO servidor, secreta)* |
| `NEXT_PUBLIC_SITE_URL` | `https://TU-DOMINIO` *(el definitivo, no localhost)* |
| `CRON_SECRET` | *(genera uno nuevo, p. ej. `openssl rand -hex 32`)* |

Las `TWILIO_*` solo si vas a activar recordatorios por WhatsApp (opcional).

---

## Paso 4 — Twilio en Supabase (OBLIGATORIO para el registro con OTP)

Panel de Supabase → **Authentication → Providers → Phone** → activa **Twilio** y
rellena tus credenciales de Twilio (Account SID, Auth Token, Message Service SID).

Sin esto, la app de cliente **no puede verificar teléfonos** y nadie completa el
registro. Es el paso que no se puede saltar.

---

## Paso 5 — Desplegar

```bash
cd clients/projects/salon-os
vercel --prod
```

Las migraciones de base de datos **ya están aplicadas** (las apliqué durante el
desarrollo). No necesitas `supabase db push`.

---

## Paso 6 — (Opcional) Recordatorios WhatsApp

Solo si activas recordatorios:
```bash
supabase functions deploy process-reminders --project-ref jztoyekixcziaicrnlce
```
Y configura `CRON_SECRET` + las `TWILIO_*` en Supabase y en Vercel.

> ❌ **No despliegues** las 13 Edge Functions de `denueveanueve/` — son del modelo
> antiguo (Google Calendar / loyalty externo), ya descartado. Solo `process-reminders`.

---

## Paso 7 — Las apps móviles (cliente y staff) — despliegue aparte

Son proyectos Vite independientes (`clients/projects/denueveanueve` y
`.../denueveanueve-staff`). Cada una es un deploy propio (Vercel u otro hosting
estático), con su `.env` ya apuntando a Salón OS. Se sirven por subdominio
(`denueveanueve.salonos.app`, etc.) para el white-label. Esto puede esperar al
segundo paso; el panel de gestión (salon-os) es lo primero.

---

## Verificación post-deploy (haz clic tú mismo)

- [ ] Entra al panel con tu ID de acceso.
- [ ] Sube un logo en *Ajustes → Marca* (el bug de subida ya está arreglado).
- [ ] Crea una reserva de prueba desde `/reservar/denueveanueve`.
- [ ] Comprueba que la cita aparece en la agenda.
- [ ] **No emitas facturas reales** hasta la validación de la gestoría.

> Recuerda: "tests en verde" ≠ "funciona". Dedica un rato a **usar cada pantalla
> como si fueras el salón** — así salieron cosas como el bug del logo.
