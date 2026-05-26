# SKILL: API Design & REST Best Practices

Basado en patrones de [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) — api-design-reviewer

## Principios REST HAT3X

### 1. URLs Resource-Based

```
✅ BIEN
GET    /api/users
GET    /api/users/123
POST   /api/users
PUT    /api/users/123
PATCH  /api/users/123
DELETE /api/users/123

❌ MAL
GET    /api/getUsers
POST   /api/createUser
DELETE /api/deleteUser/123
```

### 2. Sustantivos Plurales

```
✅ BIEN
/api/users
/api/projects
/api/chatbots

❌ MAL
/api/user
/api/project
/api/chatbot
```

### 3. HTTP Methods Correctos

| Método | Idempotente | Uso |
|---|---|---|
| GET | Sí | Leer recurso |
| POST | No | Crear recurso |
| PUT | Sí | Reemplazar recurso completo |
| PATCH | Sí | Actualizar campo(s) específico(s) |
| DELETE | Sí | Eliminar recurso |

### 4. Status Codes Correctos

```typescript
// 2xx — Éxito
200 OK              // GET, PUT, PATCH exitosos
201 Created         // POST exitoso (recurso creado)
204 No Content      // DELETE exitoso

// 4xx — Error del cliente
400 Bad Request     // Input inválido
401 Unauthorized    // No autenticado
403 Forbidden       // Autenticado pero sin permisos
404 Not Found       // Recurso no existe
409 Conflict        // Conflicto (ej: email duplicado)
422 Unprocessable   // Validación falló (Zod error)
429 Too Many Requests // Rate limit excedido

// 5xx — Error del servidor
500 Internal Server Error
502 Bad Gateway
503 Service Unavailable
```

---

## Response Format Estándar

### Éxito

```typescript
// GET /api/users/123
{
  "data": {
    "id": "usr_abc123",
    "name": "María García",
    "email": "maria@example.com",
    "created_at": "2026-03-31T10:00:00Z"
  }
}

// GET /api/users (lista)
{
  "data": [...],
  "meta": {
    "total": 100,
    "page": 1,
    "per_page": 10,
    "total_pages": 10
  }
}

// POST /api/users (creado)
{
  "data": { "id": "usr_abc123", ... },
  "message": "Usuario creado exitosamente"
}
```

### Error

```typescript
// 400 Bad Request
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Datos inválidos",
    "details": [
      { "field": "email", "message": "Email inválido" },
      { "field": "name", "message": "Nombre requerido" }
    ]
  }
}

// 404 Not Found
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Usuario no encontrado"
  }
}

// 500 Internal Error
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Error interno del servidor"
    // Nunca exponer stack trace en prod
  }
}
```

---

## Validación con Zod

```typescript
// schemas/user.ts
import { z } from 'zod'

export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(['admin', 'user', 'guest']).default('user'),
  metadata: z.record(z.unknown()).optional()
})

export const updateUserSchema = createUserSchema.partial()

// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createUserSchema } from '@/schemas/user'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = createUserSchema.parse(body)

    const user = await db.user.create({ data })

    return NextResponse.json({ data: user }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Datos inválidos',
            details: error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message
            }))
          }
        },
        { status: 422 }
      )
    }

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno' } },
      { status: 500 }
    )
  }
}
```

---

## Paginación

```typescript
// Query params estándar
GET /api/users?page=1&limit=20&sort=name&order=asc

// Implementación
interface PaginationParams {
  page: number
  limit: number
  sort?: string
  order?: 'asc' | 'desc'
}

async function paginate<T>(
  table: string,
  { page = 1, limit = 20, sort, order = 'asc' }: PaginationParams
) {
  const offset = (page - 1) * limit

  const [data, total] = await Promise.all([
    db.from(table)
      .select('*')
      .order(sort || 'created_at', { ascending: order === 'asc' })
      .range(offset, offset + limit - 1),
    db.from(table).count()
  ])

  return {
    data,
    meta: {
      total: total[0].count,
      page,
      limit,
      total_pages: Math.ceil(total[0].count / limit)
    }
  }
}
```

---

## Rate Limiting

```typescript
// lib/rate-limit.ts
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
})

interface RateLimitConfig {
  maxRequests: number
  windowSeconds: number
}

const defaultConfig: RateLimitConfig = {
  maxRequests: 100,
  windowSeconds: 60
}

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = defaultConfig
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  const key = `ratelimit:${identifier}`
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - config.windowSeconds

  // Limpiar old entries
  await redis.zremrangebyscore(key, 0, windowStart)

  // Contar requests en ventana
  const count = await redis.zcard(key)

  if (count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      reset: now + config.windowSeconds
    }
  }

  // Añadir request actual
  await redis.zadd(key, { score: now, member: `${now}-${Math.random()}` })
  await redis.expire(key, config.windowSeconds * 2)

  return {
    allowed: true,
    remaining: config.maxRequests - count - 1,
    reset: now + config.windowSeconds
  }
}

// Uso en API route
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'anonymous'
  const limit = await checkRateLimit(ip)

  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Demasiadas peticiones',
          retry_after: limit.reset - Math.floor(Date.now() / 1000)
        }
      },
      { status: 429, headers: { 'Retry-After': String(limit.remaining) } }
    )
  }

  // ... procesar petición
}
```

---

## Headers de Respuesta

```typescript
// Headers estándar en todas las respuestas
const STANDARD_HEADERS = {
  'Content-Type': 'application/json',
  'X-Request-ID': crypto.randomUUID(),
  'X-Response-Time': `${Date.now() - startTime}ms`
}

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
}

// Security headers (producción)
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
}
```

---

## Documentación de API

```markdown
# API Documentation — [PROYECTO]

## Autenticación

Todas las rutas requieren Bearer token en el header:
```
Authorization: Bearer <token>
```

## Endpoints

### Users

#### GET /api/users

Obtener lista de usuarios.

**Query Params:**
| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| page | number | 1 | Página actual |
| limit | number | 20 | Items por página |
| sort | string | created_at | Campo a ordenar |
| order | asc\|desc | desc | Orden |

**Response:** `200 OK`
```json
{
  "data": [...],
  "meta": { "total": 100, "page": 1, "limit": 20, "total_pages": 5 }
}
```

#### POST /api/users

Crear usuario nuevo.

**Body:**
```json
{
  "name": "María García",
  "email": "maria@example.com",
  "phone": "+34611222333"
}
```

**Response:** `201 Created`
```json
{
  "data": { "id": "usr_abc123", ... },
  "message": "Usuario creado exitosamente"
}
```

### Errores Comunes

| Code | Error | Descripción |
|------|-------|-------------|
| 400 | INVALID_REQUEST | Datos inválidos |
| 401 | UNAUTHORIZED | Token faltante o inválido |
| 403 | FORBIDDEN | Sin permisos |
| 404 | NOT_FOUND | Recurso no encontrado |
| 422 | VALIDATION_ERROR | Validación falló |
| 429 | RATE_LIMIT_EXCEEDED | Demasiadas peticiones |
| 500 | INTERNAL_ERROR | Error del servidor |
```

---

## Checklist de API Review

```markdown
- [ ] URLs siguen convención REST
- [ ] HTTP methods correctos
- [ ] Status codes apropiados
- [ ] Response format consistente
- [ ] Errores con código y mensaje claro
- [ ] Validación Zod en todos los inputs
- [ ] Rate limiting implementado
- [ ] CORS configurado
- [ ] Headers de seguridad presentes
- [ ] Documentación actualizada
- [ ] Autenticación en rutas protegidas
```
