# Skill: deploy-vercel

**Invocación:** `/deploy-vercel`

**Propósito:** Despliega webs y apps en Vercel o Netlify con configuración profesional: variables de entorno, dominios, preview deployments, CI/CD y monitorización.

---

## Trigger

Se activa cuando el usuario quiere desplegar su app, configurar un dominio, gestionar variables de entorno en producción, o configurar CI/CD.

---

## Vercel — Despliegue rápido

```bash
# Instalar CLI
npm install -g vercel

# Login
vercel login

# Deploy desde la carpeta del proyecto
vercel --prod

# Deploy con variables de entorno
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
```

### vercel.json (configuración avanzada)
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

---

## Netlify — Alternativa rápida

```bash
# CLI
npm install -g netlify-cli
netlify login

# Deploy directo de la carpeta dist (sin configurar)
netlify deploy --prod --dir=dist

# O arrastrar dist/ a netlify.com/drop
```

### netlify.toml
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

---

## Variables de entorno — Gestión segura

| Variable | Prefijo Vite | Dónde va |
|---|---|---|
| Supabase URL | `VITE_SUPABASE_URL` | Frontend (pública) |
| Supabase Anon Key | `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend (pública) |
| Stripe Public Key | `VITE_STRIPE_PUBLISHABLE_KEY` | Frontend (pública) |
| Supabase Service Key | ❌ NUNCA `VITE_*` | Solo Edge Functions |
| Stripe Secret Key | ❌ NUNCA `VITE_*` | Solo backend/Edge Functions |

```bash
# Verificar que no hay secrets en el bundle
npm run build && grep -r "sk_live\|service_role" dist/
# Debe devolver vacío
```

---

## CI/CD con GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}

      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

---

## Dominio personalizado

```bash
# Vercel
vercel domains add tudominio.com
vercel domains inspect tudominio.com  # Ver registros DNS a configurar

# DNS a configurar en tu registrador:
# A record: 76.76.21.21
# CNAME: cname.vercel-dns.com (para subdominio www)
```

---

## Checklist de despliegue a producción

- [ ] Variables de entorno configuradas en Vercel/Netlify (no hardcodeadas)
- [ ] `vercel.json` / `netlify.toml` con redirects para SPA
- [ ] Headers de seguridad (X-Frame-Options, CSP)
- [ ] Cache-Control correcto en assets
- [ ] Build sin errores (`npm run build` limpio)
- [ ] TypeScript sin errores (`tsc --noEmit`)
- [ ] Preview deployment probado antes de promover a producción
- [ ] Dominio con HTTPS (automático en Vercel/Netlify)
- [ ] Monitorización de errores configurada (Sentry recomendado)
