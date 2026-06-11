# Skill: testing-vitest

**Invocación:** `/testing-vitest`

**Propósito:** Implementa testing profesional en apps React/TypeScript con Vitest, Testing Library y Playwright. Cubre unitarios, integración y e2e.

---

## Trigger

Se activa cuando el usuario quiere añadir tests, mejorar cobertura, configurar CI con tests, o garantizar que el código no regrese con cambios futuros.

---

## Setup

```bash
# Vitest + Testing Library (unitarios + integración)
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom

# Playwright (e2e)
npm install -D @playwright/test
npx playwright install
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/hooks/**', 'src/lib/**', 'src/components/**'],
      exclude: ['src/components/ui/**'],  // shadcn no testear
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
```

```ts
// src/test/setup.ts
import '@testing-library/jest-dom'
```

---

## Tests unitarios — Funciones puras

```ts
// src/lib/utils.test.ts
import { describe, it, expect } from 'vitest'
import { getMadridOffset, calcPoints } from '@/lib/utils'

describe('getMadridOffset', () => {
  it('devuelve +02:00 en verano (DST)', () => {
    expect(getMadridOffset('2026-07-15')).toBe('+02:00')
  })

  it('devuelve +01:00 en invierno', () => {
    expect(getMadridOffset('2026-01-15')).toBe('+01:00')
  })
})

describe('calcPoints', () => {
  it('calcula puntos correctamente', () => {
    expect(calcPoints([{ fixed_points: 10 }, { fixed_points: 5 }])).toBe(15)
  })

  it('devuelve 0 si no hay servicios', () => {
    expect(calcPoints([])).toBe(0)
  })
})
```

---

## Tests de hooks con React Query

```tsx
// src/hooks/useCustomer.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCustomer } from '@/hooks/useCustomer'

// Mock de Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({
            data: { id: 'cust-123', first_name: 'José', email: 'jose@test.com' },
            error: null,
          }),
        }),
      }),
    }),
  },
}))

// Mock de useAuth
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
}))

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useCustomer', () => {
  it('devuelve el customer del usuario autenticado', async () => {
    const { result } = renderHook(() => useCustomer(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.customerId).toBe('cust-123')
    expect(result.current.customer?.first_name).toBe('José')
  })

  it('devuelve null si no hay usuario', () => {
    vi.mocked(require('@/lib/auth').useAuth).mockReturnValue({ user: null })
    const { result } = renderHook(() => useCustomer(), { wrapper })
    expect(result.current.customerId).toBeNull()
  })
})
```

---

## Tests de componentes

```tsx
// src/components/RescheduleDialog.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RescheduleDialog from '@/components/RescheduleDialog'

const mockAppointment = {
  id: 'apt-1',
  start_at: '2026-04-10T10:00:00Z',
  end_at: '2026-04-10T11:00:00Z',
  reschedule_count: 0,
  // ... resto de campos
}

describe('RescheduleDialog', () => {
  it('muestra el título del dialog', () => {
    render(
      <RescheduleDialog
        appointment={mockAppointment as any}
        open={true}
        onClose={vi.fn()}
        onRescheduled={vi.fn()}
      />
    )
    expect(screen.getByText(/reprogramar cita/i)).toBeInTheDocument()
  })

  it('muestra mensaje de límite alcanzado si reschedule_count >= 3', () => {
    render(
      <RescheduleDialog
        appointment={{ ...mockAppointment, reschedule_count: 3 } as any}
        open={true}
        onClose={vi.fn()}
        onRescheduled={vi.fn()}
      />
    )
    expect(screen.getByText(/límite de reprogramaciones/i)).toBeInTheDocument()
  })
})
```

---

## Tests e2e con Playwright

```ts
// e2e/booking.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Flujo de reserva', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login')
    await page.fill('#email', 'test@denueveanueve.com')
    await page.fill('#password', 'testpassword')
    await page.click('button[type="submit"]')
    await page.waitForURL('/home')
  })

  test('completa una reserva de 6 pasos', async ({ page }) => {
    await page.goto('/book')

    // Step 1: Seleccionar centro
    await page.click('text=Centro')
    await page.waitForSelector('text=Siguiente')
    await page.click('text=Siguiente')

    // Step 2: Seleccionar sección
    await page.click('text=Caballeros')
    await page.click('text=Siguiente')

    // Step 3: Seleccionar servicio
    await page.click('text=Corte de pelo')
    await page.click('text=Siguiente')

    // ... continuar pasos
    await expect(page.locator('text=¡Cita reservada!')).toBeVisible({ timeout: 10000 })
  })
})
```

---

## Scripts en package.json

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

---

## Prioridad de tests por retorno de inversión

1. **Funciones puras** (utils, cálculos) — muy fáciles, evitan bugs silenciosos
2. **Custom hooks** — validan la lógica de negocio central
3. **Flujos críticos e2e** — login, reserva, pago
4. **Componentes UI** — solo los complejos con lógica (no los de presentación pura)
