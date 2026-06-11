# Skill: ui-ux-patterns

**Invocación:** `/ui-ux-patterns`

**Propósito:** Experto en diseño de interfaces de usuario profesionales. Patrones de UX, sistemas de diseño, micro-interacciones, estados de carga, empty states y flujos de usuario.

---

## Trigger

Se activa cuando el usuario pide mejorar la UI/UX, diseñar una pantalla, crear componentes visuales, o hacer la app más profesional y pulida.

---

## Principios de UX aplicados

### 1. Estados siempre definidos
Todo componente debe tener UI para sus 4 estados:
```
Loading → Empty → Error → With data
```

```jsx
// ✅ Componente con todos los estados
const AppointmentList = () => {
  if (loading) return <AppointmentSkeleton />      // Estado: cargando
  if (error) return <ErrorCard onRetry={refetch} /> // Estado: error
  if (!appointments.length) return <EmptyState />   // Estado: vacío
  return <AppointmentCards data={appointments} />   // Estado: datos
}
```

### 2. Feedback inmediato (< 100ms)
```jsx
// ✅ Optimistic UI — actualiza antes de confirmar con el servidor
const handleToggleFavorite = async (id: string) => {
  // 1. Actualizar UI inmediatamente
  setFavorites(prev => prev.includes(id)
    ? prev.filter(f => f !== id)
    : [...prev, id]
  )
  // 2. Persistir en servidor (sin bloquear UI)
  await toggleFavoriteAPI(id).catch(() => {
    // 3. Revertir si falla
    setFavorites(prev => prev.includes(id)
      ? prev.filter(f => f !== id)
      : [...prev, id]
    )
    toast.error('No se pudo guardar')
  })
}
```

### 3. Skeletons en lugar de spinners
```jsx
// ❌ Spinner bloquea — el usuario no sabe qué se está cargando
{loading && <Spinner />}

// ✅ Skeleton — mantiene la estructura visual
{loading && (
  <div className="space-y-3">
    {[1,2,3].map(i => (
      <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
    ))}
  </div>
)}
```

### 4. Empty states útiles
```jsx
// ❌ Texto plano
<p>No hay citas</p>

// ✅ Con contexto y acción
<div className="flex flex-col items-center gap-3 py-12 text-center">
  <CalendarOff className="h-10 w-10 text-muted-foreground" />
  <h3 className="font-medium text-foreground">Sin citas próximas</h3>
  <p className="text-sm text-muted-foreground max-w-xs">
    Reserva tu primera cita en menos de 2 minutos.
  </p>
  <Button onClick={() => navigate('/book')} className="gradient-gold">
    Reservar ahora
  </Button>
</div>
```

### 5. Mensajes de error accionables
```jsx
// ❌ Error genérico
<p>Error al cargar</p>

// ✅ Con causa y solución
<div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
  <p className="text-sm font-medium text-destructive">No pudimos cargar tus citas</p>
  <p className="text-xs text-muted-foreground mt-1">Revisa tu conexión a internet</p>
  <Button size="sm" variant="outline" onClick={refetch} className="mt-3">
    Reintentar
  </Button>
</div>
```

---

## Patrones de navegación mobile

### Bottom Navigation (apps con 3-5 secciones)
- Máximo 5 ítems
- Icono + label corto
- Indicador visual de activo
- `aria-current="page"` para accesibilidad

### Top Navigation (webs/dashboards)
- Breadcrumbs para jerarquías profundas
- Dropdown para acciones secundarias
- Avatar con menú de perfil a la derecha

### Gestos y micro-interacciones
```jsx
// Pull-to-refresh
import { motion, useMotionValue, useTransform } from 'framer-motion'

// Swipe para eliminar
import { Reorder } from 'framer-motion'

// Transiciones de página
const pageVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 }
}
```

---

## Sistema de diseño — Variables CSS

```css
/* globals.css — Tokens de diseño */
:root {
  /* Colores */
  --background: hsl(30, 10%, 6%);
  --foreground: hsl(40, 20%, 90%);
  --primary: hsl(38, 60%, 50%);      /* Gold */
  --muted: hsl(30, 8%, 15%);
  --muted-foreground: hsl(30, 10%, 55%);
  --border: hsl(30, 8%, 18%);

  /* Tipografía */
  --font-display: 'Josefin Sans', sans-serif;
  --font-body: 'Inter', sans-serif;

  /* Espaciado */
  --radius: 0.75rem;

  /* Sombras */
  --shadow-gold: 0 4px 20px hsl(38, 60%, 50%, 0.3);
  --shadow-elevated: 0 8px 32px hsl(0, 0%, 0%, 0.4);
}
```

---

## Componentes de alta frecuencia en proyectos HAT3X

| Componente | Uso | shadcn |
|---|---|---|
| Card con gradient | Highlights, métricas | `card` + CSS custom |
| Badge de estado | Estados de citas, pedidos | `badge` |
| Confirmación destructiva | Cancelar, eliminar | `alert-dialog` |
| Selector de fecha | Reservas, filtros | `calendar` + `popover` |
| Tabs de contenido | Próximas/Historial, etc. | `tabs` |
| Toast de notificación | Feedback de acciones | `sonner` |
| Drawer mobile | Menús, formularios | `vaul` |
| Skeleton | Loading states | CSS animate-pulse |

---

## Checklist UX de entregable

- [ ] Los 4 estados definidos en cada componente con datos
- [ ] Botones con estado `disabled` y `loading`
- [ ] Formularios con validación en tiempo real
- [ ] Mensajes de error con acción de recuperación
- [ ] Transiciones de página suaves (Framer Motion)
- [ ] Feedback táctil en acciones importantes (haptics en Capacitor)
- [ ] Texto legible sin zoom en móvil (mín. 16px body)
- [ ] Área táctil mínima 44×44px en elementos interactivos
