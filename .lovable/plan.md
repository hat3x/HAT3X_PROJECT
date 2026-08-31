

## Análisis

Actualmente el flujo usa `create-subscription-intent` con `payment_method_types: ['card']`, lo que restringe a solo tarjeta. El frontend usa Stripe Elements (`PaymentElement`) inline.

### Apple Pay y Google Pay

**Sí, es posible y muy sencillo.** Stripe Payment Element ya soporta Apple Pay y Google Pay de forma nativa. Solo hay que:

1. **Backend**: Cambiar `payment_method_types: ['card']` por `payment_method_types: ['card', 'link']` o mejor aún, usar `automatic_payment_methods: { enabled: true }` para que Stripe detecte automáticamente qué métodos mostrar según el dispositivo del usuario (tarjeta, Apple Pay en Safari/iOS, Google Pay en Chrome/Android).

2. **No se necesitan cambios en el frontend** — el `PaymentElement` ya renderiza automáticamente los métodos de pago disponibles.

3. **Requisito**: Hay que registrar el dominio en el dashboard de Stripe para Apple Pay (Settings → Payment methods → Apple Pay → Add domain). Esto es un paso manual.

### PayPal

**También es posible** con `automatic_payment_methods`, ya que Stripe soporta PayPal como método de pago. Requiere activar PayPal en el dashboard de Stripe (Settings → Payment methods → PayPal).

## Plan de implementación

### Paso 1: Actualizar Edge Function `create-subscription-intent`
- Reemplazar `payment_method_types: ['card']` por `automatic_payment_methods: { enabled: true }` en la creación de la suscripción.
- Esto habilita automáticamente tarjeta, Apple Pay, Google Pay, PayPal y otros métodos según disponibilidad.

### Paso 2: Actualizar Edge Function `create-checkout` (flujo alternativo)
- Añadir `payment_method_types: ['card', 'paypal']` en la sesión de checkout, o dejarlo en automático.

### Paso 3: Pasos manuales del usuario
- **Apple Pay**: Registrar el dominio de la app en Stripe Dashboard.
- **PayPal**: Activar PayPal como método de pago en Stripe Dashboard → Settings → Payment methods.

### Detalles técnicos

En `create-subscription-intent/index.ts`, línea 85-88:
```typescript
// ANTES
payment_settings: {
  save_default_payment_method: 'on_subscription',
  payment_method_types: ['card'],
},

// DESPUÉS
payment_settings: {
  save_default_payment_method: 'on_subscription',
},
payment_behavior: 'default_incomplete',
```
Y añadir en la suscripción: `automatic_payment_methods: { enabled: true }` o quitar la restricción de `payment_method_types` para que Stripe use detección automática.

No se requieren cambios en el frontend (`CheckoutForm.tsx` ni `Club.tsx`) ya que el `PaymentElement` se adapta automáticamente.

