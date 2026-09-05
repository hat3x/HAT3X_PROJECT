# Contrato de errores de `/api/reception`

Módulo compartido por **todos** los endpoints de recepción (front-desk: consultar
disponibilidad, crear/mover/cancelar la cita del propio cliente…). Garantiza que
todos hablen el mismo idioma de errores: un **código estable** de máquina, un
**mensaje legible** para el usuario y un **estado HTTP** semántico resuelto en un
único sitio.

- Contrato puro (sin `next/server`): [`errors.ts`](./errors.ts)
- Helpers de respuesta `NextResponse`: [`http.ts`](./http.ts)
- Punto de entrada: [`index.ts`](./index.ts) → `import { … } from "@/lib/reception"`

## Forma del JSON de error

Todo endpoint que falla responde **exactamente** con esta forma:

```json
{
  "error": {
    "code": "SLOT_TAKEN",
    "message": "Ese horario acaba de ocuparse. Elige otro.",
    "details": [{ "field": "date", "message": "Fecha requerida", "code": "invalid_type" }]
  }
}
```

- `code` — clave **estable** en `MAYÚSCULAS_SNAKE`. Es contrato: el cliente puede
  ramificar por él sin leer el texto. No se renombra a la ligera.
- `message` — legible, en español, seguro de mostrar tal cual. Nunca filtra detalle
  interno (SQL, stack, ids de sistema).
- `details` — opcional; solo en `VALIDATION_ERROR`, un item por campo inválido.

Cabecera fija en toda respuesta (éxito y error): `Cache-Control: no-store`.

## Códigos

### Dominio (los seis del contrato)

| Código                  | HTTP | Cuándo lanzarlo |
|-------------------------|:----:|-----------------|
| `NO_AVAILABILITY`       | 409  | No quedan huecos para la fecha/profesional/servicio pedidos. |
| `SLOT_TAKEN`            | 409  | El hueco concreto acaba de ocuparlo otra reserva (carrera). |
| `APPOINTMENT_NOT_FOUND` | 404  | No hay cita con ese id (o ya no es accesible). |
| `NOT_YOUR_APPOINTMENT`  | 403  | La cita existe pero no es de la cuenta autenticada. |
| `FEATURE_NOT_ENABLED`   | 403  | El salón no tiene contratado/activo el add-on que pide el endpoint. |
| `UNAUTHORIZED`          | 401  | Sin sesión o credenciales no válidas. |

> `NO_AVAILABILITY` y `SLOT_TAKEN` comparten 409 a propósito: son dos conflictos de
> agenda distintos y el **código** es lo que los separa.

### Transporte (comunes a cualquier endpoint JSON)

| Código             | HTTP | Cuándo |
|--------------------|:----:|--------|
| `VALIDATION_ERROR` | 400  | El cuerpo/params no pasan el esquema (Zod, JSON roto). Adjunta `details`. |
| `INTERNAL_ERROR`   | 500  | Cualquier fallo inesperado. Mensaje genérico; **nunca** expone la causa. |

Fuente única de verdad de estado + copy: `RECEPTION_ERROR_CATALOG` en `errors.ts`.

## Uso en un Route Handler

```ts
import { NextRequest } from "next/server";
import {
  ReceptionError,
  receptionCreated,
  receptionErrorResponse,
  receptionFieldErrorsFromZod,
} from "@/lib/reception";

export async function POST(request: NextRequest) {
  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw ReceptionError.validation(
        receptionFieldErrorsFromZod(parsed.error.issues),
      );
    }

    const appointment = await createReceptionBooking(parsed.data); // puede lanzar ReceptionError.slotTaken()…
    return receptionCreated(appointment, `/api/reception/appointments/${appointment.id}`);
  } catch (error) {
    // ReceptionError → su contrato; cualquier otra cosa → 500 INTERNAL_ERROR sin filtrar.
    return receptionErrorResponse(error);
  }
}
```

Lanzar un error de dominio: `throw ReceptionError.slotTaken()` (o
`throw new ReceptionError("FEATURE_NOT_ENABLED")`). El estado HTTP lo pone el
catálogo; no se pasa a mano.

## Helpers de éxito

| Helper | Resultado |
|--------|-----------|
| `receptionJson(data, { status?, headers? })` | Payload directo (por defecto 200) + `no-store`. |
| `receptionCreated(data, location?)` | 201 + cabecera `Location` opcional. |
| `receptionNoContent()` | 204 sin cuerpo (p. ej. tras cancelar). |

## Garantías de estabilidad

- **Añadir** un código nuevo o **reescribir un `message`** es un cambio no
  disruptivo.
- **Renombrar/eliminar** un `code`, o **cambiar su `status`**, es disruptivo:
  rompe a los consumidores que ramifican por él → trátalo como cambio de versión.
