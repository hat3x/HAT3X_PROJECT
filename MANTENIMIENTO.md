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
