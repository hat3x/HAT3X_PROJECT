# Mantenimiento — Salon OS

## Troubleshooting

### "Invalid API key" o errores 401 de Supabase
1. Verifica que `.env.local` existe y tiene `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` correctos.
2. Reinicia el servidor de desarrollo tras cambiar variables de entorno (Next.js las lee al arrancar).
3. Comprueba que la anon key es la del proyecto correcto (Dashboard → Project Settings → API).

### El login funciona pero /dashboard redirige a /login
- La cookie de sesión no se está refrescando. Comprueba que `src/middleware.ts` existe y que el `matcher` no excluye `/dashboard`.
- En producción detrás de proxy, verifica que el dominio de la cookie coincide con el dominio servido.

### "useSearchParams() should be wrapped in a suspense boundary"
- Cualquier componente cliente que use `useSearchParams` debe ir envuelto en `<Suspense>` (ya aplicado en `/login`). Replicar el patrón en páginas nuevas.

### Error de tipos tras cambiar el esquema de la base de datos
```bash
npx supabase gen types typescript --project-id <project-ref> > src/types/database.ts
npm run typecheck
```

### Estilos shadcn/ui no se aplican
- Verifica que la ruta del componente está cubierta por `content` en `tailwind.config.ts` (`./src/**/*.{ts,tsx}`).
- No mover componentes fuera de `src/`.

## Base de datos (Supabase)

### Aplicar migraciones
```bash
npx supabase link --project-ref <project-ref>   # una sola vez
npx supabase db push                            # aplica supabase/migrations/ en orden
```
Tras aplicar, regenerar tipos (ver arriba). Las migraciones son inmutables: para cambiar el esquema, crear una nueva con `npx supabase migration new <nombre>`.

### Modelo multi-tenant (resumen)
- **Tenant raíz:** `salons`. Toda tabla de dominio lleva `salon_id`.
- **RLS:** el acceso se resuelve por membresía en `salon_members` (roles `owner` > `manager` > `staff`). Los helpers viven en el esquema `app` (SECURITY DEFINER, no expuestos por PostgREST).
- **Integridad de tenant:** las FKs de `appointments`, `visits` y `professional_services` son compuestas `(fk_id, salon_id)` — la base de datos impide mezclar entidades de salones distintos. Al añadir tablas nuevas con FKs a entidades del salón, replicar este patrón.
- **Historial:** `appointment_history` y `customer_history` se escriben solo vía triggers; no tienen política de INSERT para clientes. `visits` se genera automáticamente al pasar una cita a `completed`.
- **Borrado de salones:** usar soft-delete (`active = false`). El DELETE físico puede chocar con las FKs RESTRICT de citas/visitas (intencionado).

### La cita no genera visita al completarse
- El trigger solo dispara en la **transición** a `completed` (`UPDATE ... SET status = 'completed'`). Si la cita ya estaba en `completed`, no re-genera (idempotente por `UNIQUE (appointment_id)`).

## Tareas periódicas

| Frecuencia | Tarea |
|---|---|
| Semanal | `npm outdated` — revisar actualizaciones de seguridad |
| Mensual | Actualizar dependencias menores y ejecutar `npm run build && npm run typecheck` |
| Tras cambios de esquema | Regenerar `src/types/database.ts` |

## Reglas del proyecto

- **TypeScript strict:** no introducir `any`. `tsconfig.json` tiene `noUncheckedIndexedAccess`: los accesos por índice devuelven `T | undefined` — manejar el caso.
- **Secretos:** `SUPABASE_SERVICE_ROLE_KEY` jamás en código cliente ni con prefijo `NEXT_PUBLIC_`. `.env.local` está en `.gitignore` — no comitear credenciales.
- **Auth:** las páginas protegidas verifican `getUser()` en el servidor además del middleware (defensa en profundidad). Mantener este patrón.
- **Componentes UI:** añadirlos con la CLI de shadcn (`npx shadcn@latest add <componente>`), no copiar a mano de otras fuentes.
