# SKILL: MCP Servers & Tools

Basado en [subinium/awesome-claude-code](https://github.com/subinium/awesome-claude-code) y [K-Dense-AI/claude-skills-mcp](https://github.com/K-Dense-AI/claude-skills-mcp)

## Qué es MCP

Model Context Protocol (MCP) es un protocolo abierto para conectar agentes de IA con herramientas y datos externos.

---

## MCP Servers Recomendados para HAT3X

### 1. GitHub MCP

**Repo:** [github/github-mcp-server](https://github.com/github/github-mcp-server)

**Qué hace:** Gestiona repositorios, issues, PRs, Actions directamente desde Claude.

**Setup:**
```bash
# En settings.json de Claude Code
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@github/mcp-server"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxx"
      }
    }
  }
}
```

**Comandos disponibles:**
- `github_search_repositories` — Buscar repos
- `github_get_issue` — Obtener issue/PR
- `github_create_issue` — Crear issue
- `github_create_pull_request` — Crear PR
- `github_list_branches` — Listar branches
- `github_search_code` — Buscar código

---

### 2. Context7 MCP (Documentación)

**Repo:** [upstash/context7](https://github.com/upstash/context7)

**Qué hace:** Inyecta documentación actualizada de librerías en el contexto.

**Setup:**
```bash
uvx mcp-server-context7
```

**Uso:**
```
@Context7 documenta Next.js 14 App Router
```

---

### 3. Playwright MCP

**Repo:** [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp-server)

**Qué hace:** Automatización de browser, screenshots, testing.

**Setup:**
```bash
npx @playwright/mcp-server
```

**Comandos:**
- `playwright_navigate` — Ir a URL
- `playwright_screenshot` — Capturar pantalla
- `playwright_click` — Click en elemento
- `playwright_fill` — Rellenar input
- `playwright_evaluate` — Ejecutar JS en página

---

### 4. Supabase MCP

**Repo:** [supabase-community/supabase-mcp](https://github.com/supabase-community/supabase-mcp)

**Qué hace:** Gestiona proyectos Supabase, queries, RLS policies.

**Setup:**
```bash
npx supabase-mcp
```

**Comandos:**
- `supabase_list_projects`
- `supabase_query_sql`
- `supabase_get_schema`
- `supabase_create_rls_policy`

---

### 5. Firecrawl MCP (Web Scraping)

**Repo:** [firecrawl/firecrawl-mcp-server](https://github.com/firecrawl/firecrawl-mcp-server)

**Qué hace:** Scraping de webs, extracción de datos, crawl profundo.

**Setup:**
```bash
npx -y firecrawl-mcp
```

**Comandos:**
- `firecrawl_scrape` — Scrapear URL
- `firecrawl_crawl` — Crawl profundo
- `firecrawl_map` — Mapear sitemap
- `firecrawl_extract` — Extraer datos estructurados

---

### 6. Hex-Line MCP (Edición Segura)

**Repo:** [levnikolaevich/claude-code-skills](https://github.com/levnikolaevich/claude-code-skills)

**Qué hace:** Edición de archivos con verificación por hash para prevenir corrupción.

**Setup:**
```bash
# Instalar skill
/plugin install hex-line@claude-code-skills
```

**Por qué usarlo:** Previene que el agente edite archivos con contexto stale.

---

## Configuración en Claude Code

### settings.json Completo

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@github/mcp-server"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxx"
      }
    },
    "context7": {
      "command": "uvx",
      "args": ["mcp-server-context7"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp-server"]
    },
    "supabase": {
      "command": "npx",
      "args": ["supabase-mcp"],
      "env": {
        "SUPABASE_URL": "https://xxx.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "xxx"
      }
    },
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc_xxx"
      }
    }
  }
}
```

---

## Patrones de Uso

### 1. Crear PR con GitHub MCP

```
@github search_repositories query="hat3x"
@github get_issue owner="hat3x" repo="repo" issue_number=123
@github create_pull_request
  owner="hat3x"
  repo="repo"
  title="feat: nueva funcionalidad"
  body="Descripción del cambio..."
  head="feature/nueva-funcionalidad"
  base="main"
```

### 2. Scraping para RAG con Firecrawl

```
@firecrawl scrape
  url="https://cliente.com/documentacion"
  formats=["markdown"]
  onlyMainContent=true

→ Indexar en Supabase Vector para RAG
```

### 3. Testing E2E con Playwright

```
@playwright navigate url="http://localhost:3000"
@playwright screenshot name="homepage"
@playwright fill selector="#email" value="test@example.com"
@playwright click selector="button[type=submit]"
@playwright screenshot name="form-submitted"
```

### 4. Query SQL con Supabase

```
@supabase query_sql
  query="SELECT * FROM users WHERE created_at > NOW() - INTERVAL '7 days'"
```

---

## Crear Tu Propio MCP Server

### Estructura Básica

```typescript
// mcp-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({
  name: 'hat3x-custom-mcp',
  version: '1.0.0'
})

// Herramienta: obtener datos de cliente
server.tool(
  'get_client_data',
  'Obtiene datos de un cliente por ID',
  {
    clientId: z.string().describe('ID del cliente')
  },
  async ({ clientId }) => {
    const data = await db.from('clients').select('*').eq('id', clientId)
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
    }
  }
)

// Resource: documentación del proyecto
server.resource(
  'project_docs',
  'project://docs',
  async (uri) => {
    const docs = await loadProjectDocs()
    return {
      contents: [{
        uri: uri.href,
        text: docs,
        mimeType: 'text/markdown'
      }]
    }
  }
)

// Conectar
const transport = new StdioServerTransport()
await server.connect(transport)
```

### Package.json

```json
{
  "name": "hat3x-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "hat3x-mcp": "./dist/mcp-server.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/mcp-server.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.22.0"
  }
}
```

---

## MCP Security Checklist

```markdown
- [ ] Tokens en variables de entorno (nunca hardcodeados)
- [ ] MCP servers de fuentes confiables (official o bien auditados)
- [ ] Permisos mínimos necesarios (GitHub token con scope limitado)
- [ ] Logs de actividad MCP habilitados
- [ ] Rate limiting configurado en APIs externas
- [ ] Validación de input en herramientas custom
```

---

## Variables de Entorno Necesarias

```env
# GitHub
GITHUB_TOKEN=ghp_xxx

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Firecrawl
FIRECRAWL_API_KEY=fc_xxx

# Context7 (opcional)
CONTEXT7_API_KEY=xxx
```

---

## Troubleshooting

### MCP Server no carga

```bash
# Verificar instalación
npx --yes @github/mcp-server --version

# Ver logs de error
# En Claude Code: revisar output del servidor

# Probar manualmente
echo '{"jsonrpc":"2.0","method":"initialize","params":{}}' | npx @github/mcp-server
```

### Timeout en herramientas

Algunas herramientas pueden tardar. Configurar timeout mayor:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "timeout": 60000  // 60 segundos
    }
  }
}
```

---

## Recursos

- [Awesome Claude Code MCP List](https://github.com/subinium/awesome-claude-code#-mcp-ecosystem)
- [MCP Server Builder Skill](https://github.com/alirezarezvani/claude-skills) — `mcp-server-builder`
- [Official MCP Spec](https://modelcontextprotocol.io/)
