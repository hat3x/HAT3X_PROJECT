# Skill: accessibility-wcag

**Invocación:** `/accessibility-wcag`

**Propósito:** Audita y corrige la accesibilidad de webs y apps según WCAG 2.1 nivel AA. Garantiza que la app sea usable por personas con discapacidad visual, motora o cognitiva.

---

## Trigger

Se activa cuando el usuario pide mejorar la accesibilidad, cumplir WCAG, hacer la app usable con lector de pantalla, o corregir errores de Lighthouse Accessibility.

---

## Los 10 errores más comunes (y su solución)

### 1. Imágenes sin `alt`
```jsx
// ❌ Mal
<img src="/logo.png" />

// ✅ Bien — imagen informativa
<img src="/logo.png" alt="Logo De Nueve a Nueve" />

// ✅ Bien — imagen decorativa
<img src="/pattern.png" alt="" role="presentation" />
```

### 2. Botones sin label accesible
```jsx
// ❌ Mal — lector de pantalla dice "botón"
<button onClick={close}><X /></button>

// ✅ Bien
<button onClick={close} aria-label="Cerrar diálogo"><X aria-hidden="true" /></button>
```

### 3. Inputs sin label asociado
```jsx
// ❌ Mal
<input type="email" placeholder="Tu email" />

// ✅ Bien
<label htmlFor="email">Correo electrónico</label>
<input id="email" type="email" />

// ✅ También válido con aria-label
<input type="email" aria-label="Correo electrónico" />
```

### 4. Contraste insuficiente
- Texto normal: ratio mínimo **4.5:1**
- Texto grande (+18px o +14px bold): ratio mínimo **3:1**
- Herramienta: https://webaim.org/resources/contrastchecker/

### 5. Foco invisible
```css
/* ❌ Nunca hacer esto */
:focus { outline: none; }

/* ✅ Foco visible y con estilo */
:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: 2px;
  border-radius: 4px;
}
```

### 6. Modales sin trap de foco
```jsx
// Usar Dialog de Radix UI / shadcn — maneja trap de foco automáticamente
import { Dialog, DialogContent } from '@/components/ui/dialog'

// Si es modal custom, usar el hook useFocusTrap o @radix-ui/react-focus-trap
```

### 7. Navegación sin estructura semántica
```jsx
// ❌ Todo divs
<div className="nav">...</div>
<div className="main">...</div>
<div className="footer">...</div>

// ✅ HTML semántico
<nav aria-label="Navegación principal">...</nav>
<main>...</main>
<footer>...</footer>
```

### 8. Estado activo no comunicado a lectores
```jsx
// ✅ Tabs, nav items, toggles
<button
  role="tab"
  aria-selected={isActive}
  aria-controls="panel-id"
>
  {label}
</button>

// ✅ Nav items
<a href="/home" aria-current={isCurrentPage ? 'page' : undefined}>
  Inicio
</a>
```

### 9. Errores de formulario no anunciados
```jsx
// ✅ Con aria-invalid y aria-describedby
<input
  id="email"
  type="email"
  aria-invalid={!!error}
  aria-describedby={error ? 'email-error' : undefined}
/>
{error && (
  <p id="email-error" role="alert" className="text-destructive text-xs">
    {error}
  </p>
)}
```

### 10. Contenido dinámico sin anunciar
```jsx
// ✅ Usar aria-live para notificaciones, toasts, loading states
<div aria-live="polite" aria-atomic="true">
  {loading && <span>Cargando...</span>}
  {success && <span>¡Guardado correctamente!</span>}
</div>
```

---

## Herramientas de auditoría

```bash
# axe-core (automatizado)
npm install -D @axe-core/react
# Añadir en desarrollo:
if (process.env.NODE_ENV === 'development') {
  const axe = require('@axe-core/react')
  axe(React, ReactDOM, 1000)
}

# Lighthouse desde terminal
npx lighthouse https://url.com --only-categories=accessibility

# eslint-plugin-jsx-a11y
npm install -D eslint-plugin-jsx-a11y
```

---

## Checklist WCAG 2.1 AA

- [ ] Todas las imágenes tienen `alt`
- [ ] Todos los inputs tienen labels asociados
- [ ] Contraste texto/fondo ≥ 4.5:1
- [ ] Foco visible en todos los elementos interactivos
- [ ] App 100% navegable con teclado (Tab, Enter, Escape, flechas)
- [ ] Modales con trap de foco y cierre con Escape
- [ ] HTML semántico (nav, main, section, article, header, footer)
- [ ] `lang` correcto en `<html>`
- [ ] Errores de formulario anunciados con `role="alert"`
- [ ] Iconos decorativos con `aria-hidden="true"`
- [ ] Lighthouse Accessibility ≥ 90
