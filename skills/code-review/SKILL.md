# SKILL: Code Review & PR Expert

Basado en [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) (8.4k ⭐)

## Rol

Eres un revisor de código senior que garantiza que todo código entregado por HAT3X sea:
- Seguro (OWASP Top 10)
- Mantenible
- Bien testeado
- Documentado

---

## Checklist de Code Review HAT3X

### 1. Seguridad (CRÍTICO)

```markdown
- [ ] No hay secrets/API keys en el código (verificar .env.example)
- [ ] Validación de input en todos los endpoints (Zod/similar)
- [ ] Rate limiting en APIs públicas
- [ ] SQL injection prevenido (queries parametrizadas)
- [ ] XSS prevenido (escape de output)
- [ ] CSRF tokens en formularios
- [ ] Auth checks en rutas protegidas
```

### 2. Calidad de Código

```markdown
- [ ] Nombres de variables descriptivos (nada de `data`, `temp`, `x`)
- [ ] Funciones pequeñas (< 30 líneas idealmente)
- [ ] Una responsabilidad por función/componente
- [ ] Sin código comentado (borrar o convertir en TODO con contexto)
- [ ] Sin console.log() en producción
- [ ] Manejo de errores explícito (nada de catch(e) {})
```

### 3. TypeScript

```markdown
- [ ] No hay `any` sin justificación explícita
- [ ] Interfaces/types para objetos complejos
- [ ] Union types para estados discretos
- [ ] Generics donde aplica (arrays, utils)
- [ ] Strict mode activado en tsconfig
```

### 4. Testing

```markdown
- [ ] Tests para lógica crítica
- [ ] Tests de integración para endpoints
- [ ] Tests E2E para flujos principales
- [ ] Cobertura mínima 70% en lógica de negocio
```

### 5. Documentación

```markdown
- [ ] README con setup claro
- [ ] .env.example completo
- [ ] Comentarios solo donde la lógica no es obvia
- [ ] JSDoc en funciones públicas complejas
```

---

## Proceso de Review

### Paso 1: Análisis Estático

```bash
# Ejecutar antes del review
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

### Paso 2: Review de Cambios

```bash
# Ver diff completo
git diff main...feature-branch

# Ver archivos cambiados
git diff --name-only main...feature-branch
```

### Paso 3: Review Sistemático

| Orden | Qué revisar | Por qué |
|---|---|---|
| 1 | README, docs | ¿Se entiende el proyecto? |
| 2 | .env.example | ¿Falta alguna variable? |
| 3 | Package.json | ¿Dependencias necesarias? |
| 4 | API routes/endpoints | ¿Validación, seguridad? |
| 5 | Componentes UI | ¿Props tipadas, accesibilidad? |
| 6 | Lógica de negocio | ¿Tests, edge cases? |
| 7 | DB migrations | ¿Índices, RLS? |

---

## Plantilla de PR Review

```markdown
## Review de Código — [NOMBRE PR]

### Resumen
[2-3 frases describiendo el cambio]

### Cambios Principales
- [Archivo 1]: [qué cambió y por qué]
- [Archivo 2]: [qué cambió y por qué]

### Security Check
- [ ] No hay secrets expuestos
- [ ] Input validation implementada
- [ ] Auth checks en rutas protegidas

### Code Quality
- [ ] Código legible y mantenible
- [ ] Funciones pequeñas y enfocadas
- [ ] Sin código muerto

### TypeScript
- [ ] Types definidos correctamente
- [ ] No hay `any` innecesarios

### Testing
- [ ] Tests añadidos/actualizados
- [ ] Tests pasando localmente

### Issues Potenciales

| Archivo | Línea | Issue | Severidad |
|---------|-------|-------|-----------|
| src/x.ts | 42 | Validación missing | Alta |

### Aprobación
- [ ] Aprobado para merge
- [ ] Aprobado con cambios menores (no blocking)
- [ ] Requiere cambios antes de merge

### Reviewer
@nombre — [FECHA]
```

---

## Patrones Comunes a Detectar

### ❌ Anti-patrón: Catch vacío

```typescript
// MAL
try {
  await riskyOperation()
} catch (e) {}

// BIEN
try {
  await riskyOperation()
} catch (error) {
  logger.error('Operation failed:', error)
  throw new CustomError('Operation failed', { cause: error })
}
```

### ❌ Anti-patrón: Any implícito

```typescript
// MAL
function process(data: any) { ... }

// BIEN
interface ProcessInput { id: string; payload: unknown }
function process({ id, payload }: ProcessInput) { ... }
```

### ❌ Anti-patrón: Función gigante

```typescript
// MAL: 100 líneas haciendo 5 cosas
async function handleUserRequest() { ... }

// BIEN: Funciones pequeñas
async function handleUserRequest() {
  const user = await validateUser()
  const data = await fetchData(user.id)
  const result = await processData(data)
  await notifyTeam(result)
  return result
}
```

### ❌ Anti-patrón: Secret en código

```typescript
// MAL
const apiKey = 'sk_live_abc123'

// BIEN
const apiKey = process.env.STRIPE_SECRET_KEY
```

---

## Métricas de Review

| Métrica | Objetivo | Cómo medir |
|---|---|---|
| Tiempo de review | < 24h | Timestamp PR → first review |
| Comentarios por PR | 3-10 | GitHub PR comments |
| Issues de seguridad | 0 críticos | Security checklist |
| Tests añadidos | ≥ 1 por feature | Cobertura diff |

---

## Herramientas Recomendadas

```bash
# ESLint (linting)
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin

# Prettier (formato)
npm install -D prettier eslint-config-prettier

# Testing
npm install -D vitest @testing-library/react @testing-library/jest-dom

# Security audit
npm audit
npm install -D npm-audit-ci-wrapper
```

---

## Checklist Final de Merge

- [ ] CI pasando (tests, lint, build)
- [ ] 1+ approvals de reviewers
- [ ] Security checklist completada
- [ ] README/.env.example actualizados
- [ ] Branch actualizado con main (sin conflictos)
- [ ] Commit messages siguiendo convención
