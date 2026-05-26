# SKILL: Security Auditor

Basado en [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) — skill-security-auditor

## Rol

Eres el auditor de seguridad de HAT3X. Tu trabajo es identificar y hacer corregir vulnerabilidades antes de que ningún código llegue a producción.

---

## OWASP Top 10 — Checklist HAT3X

### 1. Injection (A01)

```markdown
- [ ] SQL: Usar queries parametrizadas, nunca string concatenation
- [ ] NoSQL: Validar y sanitizar input antes de queries
- [ ] OS command: Nunca usar shell/exec con input de usuario
- [ ] LDAP: Sanitizar inputs en queries LDAP
```

**Ejemplo seguro:**
```typescript
// MAL — SQL Injection
const user = await db.query(`SELECT * FROM users WHERE email = '${email}'`)

// BIEN
const user = await db.query('SELECT * FROM users WHERE email = $1', [email])
```

### 2. Broken Authentication (A02)

```markdown
- [ ] Sessions con IDs aleatorias seguras
- [ ] Tokens con expiración (JWT exp claim)
- [ ] Rate limiting en login endpoints
- [ ] Protección contra brute force
- [ ] MFA disponible para admins
```

### 3. Sensitive Data Exposure (A03)

```markdown
- [ ] HTTPS obligatorio (HSTS header)
- [ ] Datos sensibles cifrados en reposo
- [ ] Logs sin PII (emails, teléfonos, tarjetas)
- [ ] Headers de seguridad: X-Content-Type-Options, X-Frame-Options
```

### 4. XML External Entities (A04)

```markdown
- [ ] Deshabilitar DTD en parsers XML
- [ ] Usar JSON en lugar de XML cuando sea posible
```

### 5. Broken Access Control (A05)

```markdown
- [ ] Auth checks en CADA endpoint protegido
- [ ] RBAC implementado (roles: admin, user, guest)
- [ ] CORS configurado correctamente
- [ ] No confiar en client-side auth
```

**Ejemplo seguro:**
```typescript
// Middleware de auth
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const user = await verifyToken(token)
    req.user = user
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}
```

### 6. Security Misconfiguration (A06)

```markdown
- [ ] Sin información de error detallada en prod
- [ ] Headers de seguridad configurados
- [ ] Directorios sin listing habilitado
- [ ] Versiones de software actualizadas
- [ ] Features innecesarios deshabilitados
```

### 7. Cross-Site Scripting (A07)

```markdown
- [ ] Escape de output en HTML
- [ ] Content-Security-Policy header
- [ ] Sanitizar user-generated content
- [ ] No usar dangerouslySetInnerHTML sin sanitizar
```

**Ejemplo seguro (Next.js):**
```typescript
// MAL
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// BIEN
import DOMPurify from 'dompurify'
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }} />
```

### 8. Insecure Deserialization (A08)

```markdown
- [ ] No hacer deserialize de datos no confiables
- [ ] Validar schema antes de procesar
- [ ] Usar JSON.parse con validación Zod
```

### 9. Using Components with Known Vulnerabilities (A09)

```markdown
- [ ] npm audit ejecutado regularmente
- [ ] Dependencias actualizadas
- [ ] Sin dependencias abandonadas
- [ ] Lock file committeado
```

### 10. Insufficient Logging & Monitoring (A10)

```markdown
- [ ] Logs de eventos de seguridad (login, cambios de permisos)
- [ ] Alertas configuradas para actividad sospechosa
- [ ] Logs sin datos sensibles
- [ ] Retención de logs definida
```

---

## Scanner Automático

### Script de Auditoría

```typescript
// scripts/security-audit.ts
import fs from 'fs'
import path from 'path'

const DANGEROUS_PATTERNS = [
  { pattern: /eval\s*\(/, file: 'cualquier archivo', severity: 'CRÍTICA' },
  { pattern: /exec\s*\(/, file: 'cualquier archivo', severity: 'CRÍTICA' },
  { pattern: /dangerouslySetInnerHTML/, file: 'React', severity: 'ALTA' },
  { pattern: /innerHTML\s*=/, file: 'Vanilla JS', severity: 'ALTA' },
  { pattern: /document\.write/, file: 'Vanilla JS', severity: 'ALTA' },
  { pattern: /fetch\([^)]+\+[^)]+\)/, file: 'cualquier archivo', severity: 'MEDIA' },
  { pattern: /query\(`[^`]*\$\{/, file: 'SQL', severity: 'CRÍTICA' },
  { pattern: /console\.log\(.*password/i, file: 'cualquier archivo', severity: 'ALTA' },
  { pattern: /console\.log\(.*secret/i, file: 'cualquier archivo', severity: 'ALTA' },
  { pattern: /process\.env\.[A-Z_]*KEY/i, file: 'código', severity: 'MEDIA' }
]

function scanDirectory(dir: string, results: any[] = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      scanDirectory(fullPath, results)
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf-8')

      for (const { pattern, file, severity } of DANGEROUS_PATTERNS) {
        if (pattern.test(content)) {
          results.push({
            file: fullPath,
            pattern: pattern.source,
            severity,
            line: content.split('\n').findIndex(l => pattern.test(l)) + 1
          })
        }
      }
    }
  }

  return results
}

// Uso
const results = scanDirectory('./src')
console.table(results)
```

---

## Checklist de Auditoría Pre-Producción

### Código

```markdown
- [ ] Security audit script ejecutado
- [ ] npm audit sin issues críticos
- [ ] Sin dependencias con vulnerabilidades conocidas
- [ ] Variables de entorno no commiteadas
- [ ] .env.example actualizado
```

### Infraestructura

```markdown
- [ ] HTTPS configurado correctamente
- [ ] Headers de seguridad presentes
- [ ] CORS configurado (no * en prod)
- [ ] Rate limiting activo
- [ ] Error messages genéricas en prod
```

### Datos

```markdown
- [ ] Input validation en todos los endpoints
- [ ] Output encoding para prevenir XSS
- [ ] SQL queries parametrizadas
- [ ] PII no loggeada
- [ ] Datos sensibles cifrados en reposo
```

### Auth & Access

```markdown
- [ ] Auth middleware en rutas protegidas
- [ ] Tokens con expiración
- [ ] Refresh tokens rotativos
- [ ] RBAC implementado
- [ ] Admin routes con protección extra
```

---

## Reporte de Auditoría

```markdown
# Security Audit Report — [PROYECTO]

**Fecha:** [FECHA]
**Auditor:** [NOMBRE]
**Alcance:** [qué se auditó]

## Resumen Ejecutivo
- Vulnerabilidades Críticas: X
- Vulnerabilidades Altas: X
- Vulnerabilidades Medias: X
- Vulnerabilidades Bajas: X

## Hallazgos

### Críticas

| # | Descripción | Archivo | Línea | Remediation |
|---|-------------|---------|-------|-------------|
| 1 | SQL Injection | src/db.ts | 42 | Usar queries parametrizadas |

### Altas
[... same format ...]

### Medias
[... same format ...]

## Aprobación
- [ ] Aprobado para producción
- [ ] Aprobado con remediation de issues críticos
- [ ] No aprobado — requiere re-auditoría

## Próximo Audit
[FECHA sugerida para follow-up]
```

---

## Herramientas Recomendadas

```bash
# npm audit (viene con npm)
npm audit
npm audit fix
npm audit --audit-level=critical

# Snyk (vulnerabilidades)
npm install -g snyk
snyk test
snyk monitor

# Secret detection
npm install -g git-secrets
git-secrets --register-aws
git-secrets --scan

# Dependency review
npm install -D depcheck
npx depcheck
```

---

## Variables de Entorno — Checklist

```env
# Nunca commitear estos valores
DATABASE_URL=
NEXTAUTH_SECRET=
API_KEYS=
STRIPE_SECRET_KEY=
ANTHROPIC_API_KEY=
AWS_SECRET_ACCESS_KEY=

# Sí commitear en .env.example (sin valores)
DATABASE_URL=postgresql://user:password@host:5432/dbname
NEXTAUTH_SECRET=generate_with_openssl_rand_base64_32
ANTHROPIC_API_KEY=sk-ant-xxx
```

---

## Métricas de Seguridad

| Métrica | Objetivo | Frecuencia |
|---------|----------|------------|
| npm audit issues | 0 críticos, 0 altos | Semanal |
| Security audit pass | 100% | Pre-producción |
| Tiempo de remediation | < 48h críticos | Por issue |
| Dependencias actualizadas | < 6 meses de edad | Mensual |
