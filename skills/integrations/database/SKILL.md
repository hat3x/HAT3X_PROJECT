# SKILL: Base de Datos y Webhooks

## Stack de Base de Datos HAT3X

| Opción | Cuándo | Complejidad |
|---|---|---|
| **Supabase** | Default — PostgreSQL gestionado, Auth incluida, realtime, pgvector | Baja |
| **PlanetScale** | Si el cliente necesita MySQL o escalado serverless extremo | Media |
| **Redis (Upstash)** | Sesiones, caché, colas, rate limiting | Baja |
| **Airtable** | Clientes no técnicos que necesitan ver/editar datos fácilmente | Baja |

---

## Supabase — Operaciones Frecuentes

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx  # Para operaciones server-side
```

### Setup
```typescript
import { createClient } from '@supabase/supabase-js';

// Client-side (limitado por RLS)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Server-side (acceso completo, solo en backend)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

### Operaciones CRUD
```typescript
// Insertar
const { data, error } = await supabaseAdmin
  .from('conversations')
  .insert({
    session_id: 'abc123',
    channel: 'whatsapp',
    customer_phone: '+34611222333',
    messages: [],
    created_at: new Date().toISOString()
  })
  .select()
  .single();

// Actualizar
await supabaseAdmin
  .from('conversations')
  .update({ messages: updatedMessages, updated_at: new Date().toISOString() })
  .eq('session_id', sessionId);

// Consultar
const { data: conversations } = await supabaseAdmin
  .from('conversations')
  .select('*')
  .eq('customer_phone', phone)
  .order('created_at', { ascending: false })
  .limit(10);

// Upsert
await supabaseAdmin
  .from('contacts')
  .upsert({ email: 'cliente@email.com', name: 'María' }, { onConflict: 'email' });
```

### Schemas frecuentes en proyectos HAT3X

```sql
-- Sesiones de chatbot
CREATE TABLE chat_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  channel TEXT NOT NULL,  -- 'web' | 'whatsapp' | 'telegram'
  customer_id TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  messages JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE
);

-- Log de llamadas (Retell AI)
CREATE TABLE call_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id TEXT UNIQUE NOT NULL,
  agent_id TEXT NOT NULL,
  from_number TEXT,
  to_number TEXT,
  duration_ms INTEGER,
  transcript JSONB,
  analysis JSONB,
  outcome TEXT,  -- 'appointment_set' | 'callback_requested' | 'not_qualified' | etc.
  crm_synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contactos unificados
CREATE TABLE contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE,
  phone TEXT,
  name TEXT,
  source TEXT,  -- 'chatbot_web' | 'voice_agent' | 'form' | etc.
  crm_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Supabase Vector (RAG)

Para chatbots con base de conocimiento (RAG):

```sql
-- Habilitar extensión
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabla de documentos indexados
CREATE TABLE knowledge_base (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  embedding VECTOR(1536),  -- dimensión según modelo
  metadata JSONB DEFAULT '{}',  -- {source, title, section, date}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda eficiente
CREATE INDEX ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

```typescript
// Búsqueda semántica
async function searchKnowledge(query: string, limit = 5) {
  const embeddingRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query
  });
  const embedding = embeddingRes.data[0].embedding;

  const { data } = await supabaseAdmin.rpc('match_knowledge', {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: limit
  });

  return data;
}
```

```sql
-- Función RPC para búsqueda
CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (id UUID, content TEXT, metadata JSONB, similarity FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT id, content, metadata, 1 - (embedding <=> query_embedding) AS similarity
  FROM knowledge_base
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
```

---

## Redis / Upstash — Sesiones y Caché

Para chatbots con volumen alto o que necesitan TTL por conversación:

```env
UPSTASH_REDIS_URL=https://xxx.upstash.io
UPSTASH_REDIS_TOKEN=xxx
```

```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
});

// Guardar sesión (expira en 24h)
await redis.set(`session:${sessionId}`, JSON.stringify(messages), { ex: 86400 });

// Leer sesión
const raw = await redis.get<string>(`session:${sessionId}`);
const messages = raw ? JSON.parse(raw) : [];

// Rate limiting
const key = `rate:${userId}`;
const requests = await redis.incr(key);
if (requests === 1) await redis.expire(key, 60);  // ventana de 1 minuto
if (requests > 20) throw new Error('Rate limit exceeded');
```

---

## Webhooks — Patrones de Implementación

### Webhook receptor seguro
```typescript
import crypto from 'crypto';

// Verificar firma del webhook (HMAC)
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expected}`)
  );
}

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-signature'] as string;
  if (!verifyWebhookSignature(req.body.toString(), signature, process.env.WEBHOOK_SECRET!)) {
    return res.status(401).send('Invalid signature');
  }

  // Procesar de forma asíncrona — responder 200 inmediatamente
  res.sendStatus(200);
  processWebhookAsync(JSON.parse(req.body.toString()));
});
```

---

## Variables de Entorno Necesarias

```env
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# Upstash Redis
UPSTASH_REDIS_URL=https://xxx.upstash.io
UPSTASH_REDIS_TOKEN=xxx

# Webhook security
WEBHOOK_SECRET=secret_xxx
```

---

## Checklist de Base de Datos

- [ ] Migraciones versionadas y documentadas (nunca cambios manuales en prod)
- [ ] Row Level Security (RLS) activada en Supabase para tablas con datos de clientes
- [ ] Índices creados para las queries más frecuentes
- [ ] Backup automático configurado (Supabase lo hace por defecto)
- [ ] No se guardan datos sensibles sin cifrar (tokens, contraseñas)
- [ ] TTL configurado para datos temporales (sesiones, logs viejos)
