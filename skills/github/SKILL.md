# SKILL: GitHub — Gestión de Repositorios

## Flujo Estándar HAT3X

### 1. Crear Repositorio Nuevo

```bash
# Crear repo desde CLI
gh repo create hat3x/proyecto-cliente --public --clone

# O desde GitHub web:
# 1. github.com/new
# 2. Nombre: [cliente]-[tipo]-[fecha]
# 3. README: sí
# 4. .gitignore: Node (para Next.js) / Python (para scripts)
# 5. License: MIT
```

### 2. Estructura Inicial para Proyecto Web

```bash
cd proyecto-cliente

# Inicializar Next.js
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir

# Instalar dependencias base
npm install @anthropic-ai/sdk
npm install @supabase/supabase-js
npm install zod react-hook-form @hookform/resolvers

# Inicializar shadcn
npx shadcn@latest init

# Crear estructura de directorios
mkdir -p src/components/{ui,layout,shared}
mkdir -p src/lib src/hooks src/types
mkdir -p docs scripts

# Archivos esenciales
touch README.md .env.example
```

### 3. .gitignore para Proyectos HAT3X

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Build
dist/
build/
.next/
out/

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Testing
coverage/
.turbo
.vercel

# Editor
.vscode/*
!.vscode/extensions.json
.idea/
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# HAT3X - Credentials
*.pem
*.key
credentials.json
service-account.json
```

### 4. .env.example Template

```env
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Auth
NEXTAUTH_SECRET=generate_with_openssl_rand_base64_32
NEXTAUTH_URL=http://localhost:3000

# APIs (server-side only)
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx

# Services
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# Integrations
HUBSPOT_ACCESS_TOKEN=pat-xxx
CAL_API_KEY=cal_live_xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# WhatsApp (si aplica)
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```

---

## README.md Template HAT3X

```markdown
# [Nombre del Proyecto]

> [Descripción breve de 1-2 frases]

## Stack

- **Framework:** Next.js 14+ (App Router)
- **Lenguaje:** TypeScript
- **Estilos:** Tailwind CSS + shadcn/ui
- **Base de datos:** Supabase (PostgreSQL)
- **Auth:** NextAuth.js / Clerk
- **IA:** Claude API (Anthropic)
- **Deploy:** Vercel

## Requisitos Previos

- Node.js 18+
- npm / pnpm
- Cuenta en Vercel y Supabase

## Setup Local

```bash
# 1. Clonar repositorio
git clone https://github.com/hat3x/[repo-name].git
cd [repo-name]

# 2. Instalar dependencias
npm install

# 3. Copiar variables de entorno
cp .env.example .env.local

# 4. Editar .env.local con tus credenciales

# 5. Ejecutar en desarrollo
npm run dev
```

Visita http://localhost:3000

## Scripts Disponibles

```bash
npm run dev      # Desarrollo (localhost:3000)
npm run build    # Build de producción
npm run start    # Start en producción
npm run lint     # ESLint
```

## Deploy en Vercel

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel

# Deploy a producción
vercel --prod
```

## Variables de Entorno en Vercel

Configurar en Vercel Dashboard → Project Settings → Environment Variables:

| Variable | Valor |
|---|---|
| DATABASE_URL | Tu connection string de Supabase |
| ANTHROPIC_API_KEY | Tu API key de Anthropic |
| NEXTAUTH_SECRET | Generar con `openssl rand -base64 32` |

## Estructura del Proyecto

```
src/
├── app/              # App Router (páginas)
├── components/       # Componentes React
│   ├── ui/          # shadcn/ui
│   └── shared/      # Componentes compartidos
├── lib/             # Utilidades y configuraciones
└── types/           # TypeScript types
```

## Contacto

Proyecto creado por HAT3X para [Cliente].
Soporte: soporte@hat3x.com
```

---

## Commits — Convenciones HAT3X

### Formato de Commit

```
<tipo>(<scope>): <descripción breve>

[cuerpo opcional - más detalles si es necesario]

[footer opcional - referencias a issues]
```

### Tipos de Commit

| Tipo | Cuándo usarlo |
|---|---|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de bug |
| `refactor` | Refactorización (sin cambios de comportamiento) |
| `style` | Cambios de formato/estilo (sin cambios de código) |
| `docs` | Documentación |
| `test` | Tests |
| `chore` | Configuración, dependencias, tooling |
| `perf` | Mejoras de rendimiento |
| `ci` | Cambios en CI/CD |

### Ejemplos

```bash
# Nueva funcionalidad
git commit -m "feat(chatbot): añadir integración con WhatsApp Business API"

# Bug fix
git commit -m "fix(forms): validar email antes de enviar formulario de contacto"

# Documentación
git commit -m "docs(readme): añadir instrucciones de deploy en Vercel"

# Configuración
git commit -m "chore(deps): actualizar Next.js a 14.2.0"
```

---

## Ramas y Pull Requests

### Estrategia de Ramas

```
main              ← Rama de producción (protegida)
├── develop       ← Rama de desarrollo (opcional para proyectos grandes)
├── feature/xxx   ← Ramas de funcionalidad
└── hotfix/xxx    ← Correcciones urgentes
```

### Crear Feature Branch

```bash
git checkout -b feature/chatbot-whatsapp-integration
```

### Crear Pull Request

```bash
# Subir cambios
git push origin feature/chatbot-whatsapp-integration

# Crear PR
gh pr create \
  --title "feat: Integración WhatsApp Business API" \
  --body "
## Cambios
- Integración con Twilio WhatsApp API
- Webhook para recibir mensajes
- Clasificación con OpenAI

## Testing
- [ ] Pruebas de envío de mensajes
- [ ] Pruebas de recepción de webhooks
- [ ] Pruebas de clasificación IA

## Screenshots
[si aplica]

## Checklist
- [ ] README actualizado
- [ ] .env.example actualizado
- [ ] Tests pasando localmente
"
```

### Code Review Checklist

- [ ] Código sigue convenciones TypeScript
- [ ] No hay console.log() en producción
- [ ] Variables de entorno usadas correctamente
- [ ] Componentes con props tipadas
- [ ] Manejo de errores implementado
- [ ] Tests añadidos/actualizados

---

## GitHub Actions — CI/CD Básico

### Workflow de Tests y Lint

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test-and-lint:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run ESLint
      run: npm run lint

    - name: Run TypeScript check
      run: npx tsc --noEmit

    - name: Run tests
      run: npm test
      env:
        CI: true
```

### Workflow de Deploy Automático

```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'

    - name: Install Vercel CLI
      run: npm install -g vercel

    - name: Deploy to Vercel
      run: vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
      env:
        VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
        VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

## GitHub Secrets Necesarios

Configurar en Repo Settings → Secrets and variables → Actions:

```
VERCEL_TOKEN        # Token de Vercel para deploy
VERCEL_ORG_ID       # Organization ID de Vercel
VERCEL_PROJECT_ID   # Project ID de Vercel

# API Keys (si se usan en Actions)
ANTHROPIC_API_KEY   # Claude API
OPENAI_API_KEY      # OpenAI embeddings
SUPABASE_URL        # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY  # Supabase admin key
```

---

## Release y Versionado

### Crear Release

```bash
# Con gh CLI
gh release create v1.0.0 \
  --title "v1.0.0 - Lanzamiento inicial" \
  --notes "
## Cambios
- Primera versión del chatbot
- Integración con WhatsApp
- Dashboard básico

## Notas
Versión inicial lista para producción
"
```

### CHANGELOG.md Template

```markdown
# Changelog

Todos los cambios notables en este proyecto.

## [1.0.0] - 2026-03-31

### Añadido
- Chatbot web con RAG
- Integración WhatsApp Business
- Dashboard de analytics

### Cambiado
- Mejora en rendimiento de búsqueda semántica

### Corregido
- Error en formulario de contacto en Safari
```

---

## Checklist de Repositorio Listo

- [ ] README.md completo con instrucciones de setup
- [ ] .env.example con todas las variables necesarias
- [ ] .gitignore configurado para el stack
- [ ] LICENSE (MIT por defecto)
- [ ] CI workflow configurado (.github/workflows/ci.yml)
- [ ] Ramas principales protegidas (main)
- [ ] Pull Request template (.github/PULL_REQUEST_TEMPLATE.md)
- [ ] Issue templates si aplica (.github/ISSUE_TEMPLATE/)
- [ ] Primer commit con estructura base funcional
