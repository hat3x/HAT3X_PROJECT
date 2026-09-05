# Deployment Guide — salon-os

Pipeline completo: lint → tests → build → E2E → deploy (Vercel).

---

## Arquitectura del pipeline

```
push / PR
    │
    ├── lint          (ESLint + TypeScript)
    ├── test          (Vitest — unitarios e integración)
    │
    │   (ambos deben pasar)
    │
    └── build         (next build)
            │
            ├── e2e   (Playwright — solo en main push)
            │       │
            │       └── deploy-production  (Vercel --prod)
            │
            └── deploy-preview            (Vercel preview, solo en PRs)
```

- **PRs**: lint + test + build + preview deploy en Vercel. La URL del preview se comenta automáticamente en el PR.
- **main**: lint + test + build + E2E + deploy a producción. El deploy solo ocurre si los E2E pasan.

---

## Configuración inicial (una sola vez)

### 1. Crear proyecto en Vercel

```bash
# En la raíz del proyecto
npm install -g vercel@latest
vercel login
vercel link   # enlaza con el proyecto Vercel existente o crea uno nuevo
```

Esto genera `.vercel/project.json` con `orgId` y `projectId`. Anótalos.

### 2. Secretos en GitHub

Ve a **Settings → Secrets and variables → Actions** del repositorio y añade:

| Secret | Cómo obtenerlo |
|--------|---------------|
| `VERCEL_TOKEN` | vercel.com → Account Settings → Tokens → Create Token |
| `VERCEL_ORG_ID` | `.vercel/project.json` → campo `orgId` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` → campo `projectId` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API |

### 3. Variable de repositorio (opcional)

En **Settings → Secrets and variables → Actions → Variables**:

| Variable | Valor |
|----------|-------|
| `NEXT_PUBLIC_SITE_URL` | URL de producción, p.ej. `https://salonos.com` |

Si no se configura, el build usa `https://salon-os.vercel.app` como fallback.

### 4. Variables de entorno en Vercel

En el panel de Vercel → **Project → Settings → Environment Variables**, añade:

| Variable | Entorno | Descripción |
|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | URL pública de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | Clave anon de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | Solo producción — nunca en preview |
| `NEXT_PUBLIC_SITE_URL` | Production | URL canónica de producción |
| `TWILIO_ACCOUNT_SID` | Production | Solo si WhatsApp activo |
| `TWILIO_AUTH_TOKEN` | Production | Solo si WhatsApp activo |
| `TWILIO_WHATSAPP_FROM` | Production | Solo si WhatsApp activo |
| `WHATSAPP_REMINDERS_ENABLED` | Production | `true` solo con plantillas aprobadas |

### 5. Deshabilitar deploy automático de Vercel

El `vercel.json` ya incluye `"github": { "enabled": false }` para que solo GitHub Actions controle los deploys. Si el proyecto Vercel ya tenía la integración GitHub activa, desactívala también en:

**Vercel → Project → Settings → Git → Disconnect**.

### 6. Protección de la rama `main`

En **GitHub → Settings → Branches → Add branch protection rule** para `main`:

- [x] Require status checks to pass before merging
  - `Lint & Type Check`
  - `Unit & Integration Tests`
  - `Build`
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings

---

## Dominio personalizado

En **Vercel → Project → Settings → Domains**:

1. Añadir el dominio: `salonos.com` (o el dominio elegido)
2. Vercel genera los registros DNS a añadir en tu proveedor
3. Una vez propagado, asegúrate de que `NEXT_PUBLIC_SITE_URL` en GitHub Variables y en Vercel Environment Variables apunta a ese dominio

---

## Entornos de preview

Cada PR crea automáticamente un entorno de preview con URL única del tipo:
```
https://salon-os-<hash>-<org>.vercel.app
```

La URL se publica como comentario en el PR. Los entornos de preview usan las variables de entorno configuradas en Vercel para el entorno "Preview".

**Importante:** `SUPABASE_SERVICE_ROLE_KEY` y `WHATSAPP_REMINDERS_ENABLED=true` **nunca** deben estar en el entorno Preview.

---

## Artefactos del pipeline

| Artefacto | Retención | Descripción |
|-----------|-----------|-------------|
| `next-build-<sha>` | 1 día | Output de `next build`, compartido entre jobs |
| `playwright-report-<sha>` | 14 días | Informe HTML de Playwright, visible en Actions |

---

## Comandos útiles en local

```bash
# Instalar CLI de Vercel
npm install -g vercel@latest

# Simular build de producción local
vercel build --prod

# Ver logs del último deploy
vercel logs

# Listar deployments
vercel ls
```
