# SKILL: RAG para Chatbots

## Qué es RAG

Retrieval-Augmented Generation: buscar información relevante en una base de conocimiento y pasarla al LLM como contexto para generar respuestas precisas.

---

## Arquitectura RAG HAT3X

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Documentos │────▶│  Ingesta &   │────▶│   Vector    │
│  (PDF, web, │     │  Chunking    │     │   Database  │
│   Notion)   │     │  + Embedding │     │  (Supabase) │
└─────────────┘     └──────────────┘     └─────────────┘
                                                │
                                                ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Usuario   │◀────│   Claude +   │◀────│  Búsqueda   │
│   pregunta  │     │   Respuesta  │     │  Semántica  │
└─────────────┘     └──────────────┘     └─────────────┘
```

---

## Ingesta de Documentos

### Script de Ingesta (Supabase pgvector)

```typescript
// scripts/ingest.ts
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { PDFLoader } from 'langchain/document_loaders/fs/pdf'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import * as fs from 'fs'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function embedText(text: string): Promise<number[]> {
  // Usar API de embedding (OpenAI, Cohere, o modelo local)
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536
    })
  })
  const data = await res.json()
  return data.data[0].embedding
}

async function ingestDocument(filePath: string, source: string) {
  // 1. Cargar documento
  const loader = new PDFLoader(filePath)
  const docs = await loader.load()

  // 2. Chunking
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 512,
    chunkOverlap: 50
  })
  const chunks = await splitter.splitDocuments(docs)

  console.log(`Procesando ${chunks.length} chunks...`)

  // 3. Embedding e inserción
  for (const chunk of chunks) {
    const embedding = await embedText(chunk.pageContent)

    await supabase.from('knowledge_base').insert({
      content: chunk.pageContent,
      embedding,
      metadata: {
        source,
        page: chunk.metadata.loc?.pageNumber,
        ingested_at: new Date().toISOString()
      }
    })
  }

  console.log('✅ Documento indexado')
}

// Uso
ingestDocument('./docs/manual-producto.pdf', 'manual-producto')
```

---

## Búsqueda Semántica

### Función de Retrieval

```typescript
// src/retrieval.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function retrieveContext(query: string, limit = 5): Promise<string[]> {
  // 1. Embedding de la query
  const embedding = await getEmbedding(query)

  // 2. Búsqueda por similitud
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: limit
  })

  if (error) {
    console.error('Error en búsqueda RAG:', error)
    return []
  }

  // 3. Extraer solo el contenido
  return data.map((doc: any) => doc.content)
}

async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text
    })
  })
  const data = await res.json()
  return data.data[0].embedding
}
```

### Función SQL en Supabase

```sql
-- Ejecutar una vez en Supabase SQL Editor
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    id,
    content,
    metadata,
    1 - (embedding <=> query_embedding) AS similarity
  FROM knowledge_base
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
```

---

## System Prompt con RAG

```markdown
Eres un asistente de IA para [EMPRESA]. Respondes preguntas usando
la base de conocimiento proporcionada.

## Reglas
- Usa SOLO la información del contexto para responder
- Si el contexto no tiene la información, di "No tengo esa información disponible"
- NUNCA inventes datos, precios, fechas o características
- Cita la fuente cuando sea relevante ("Según nuestro manual...")
- Respuestas cortas (2-4 frases) a menos que el usuario pida más

## Contexto relevante
{{context_chunks}}

## Historial de conversación
{{conversation_history}}

## Pregunta del usuario
{{user_question}}
```

---

## Implementación del Chatbot

```typescript
// src/chatbot.ts
import Anthropic from '@anthropic-ai/sdk'
import { retrieveContext } from './retrieval'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `Eres un asistente de IA para HAT3X.
Usa solo la información del contexto proporcionado.
Si no sabes algo, di "No tengo esa información".
Respuestas cortas y útiles.`

export async function handleMessage(sessionId: string, userMessage: string) {
  // 1. Retrieval
  const contextChunks = await retrieveContext(userMessage, 5)
  const context = contextChunks.join('\n\n---\n\n')

  // 2. Construir prompt
  const prompt = `
Contexto relevante:
${context}

Pregunta: ${userMessage}
`

  // 3. Generar respuesta con Claude
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }]
  })

  const reply = response.content[0].type === 'text'
    ? response.content[0].text
    : 'Lo siento, no pude generar una respuesta.'

  // 4. Log para analytics
  await logConversation(sessionId, userMessage, reply, contextChunks)

  return reply
}
```

---

## Fuentes de Conocimiento Soportadas

| Fuente | Método de Ingesta |
|---|---|
| PDFs | `langchain PDFLoader` |
| Notion | Notion API → markdown |
| Web scraping | `cheerio` + `playwright` |
| Google Docs | Google Drive API |
| Confluence | Confluence API |
| Markdown local | `fs.readFileSync` |

---

## Actualización de la Base de Conocimiento

### Re-indexado Completo

```typescript
// scripts/reindex-all.ts
import { clearDatabase } from './db'
import { ingestDocument } from './ingest'

async function reindexAll() {
  console.log('⚠️ Borrando base de conocimiento existente...')
  await clearDatabase()

  const documents = [
    { path: './docs/manual.pdf', source: 'manual' },
    { path: './docs/faq.md', source: 'faq' },
    { path: './docs/precios.md', source: 'precios' }
  ]

  for (const doc of documents) {
    console.log(`Procesando ${doc.source}...`)
    await ingestDocument(doc.path, doc.source)
  }

  console.log('✅ Re-indexado completo')
}
```

### Ingesta Incremental

```typescript
// Para añadir documentos sin borrar lo existente
async function ingestNewDocument(filePath: string, source: string) {
  // Verificar si ya existe
  const { data } = await supabase
    .from('knowledge_base')
    .select('id')
    .eq('metadata->>source', source)
    .limit(1)

  if (data && data.length > 0) {
    // Borrar antes de re-indexar
    await supabase
      .from('knowledge_base')
      .delete()
      .eq('metadata->>source', source)
  }

  await ingestDocument(filePath, source)
}
```

---

## Variables de Entorno

```env
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# Embeddings (OpenAI)
OPENAI_API_KEY=sk-xxx

# Opcional: para web scraping
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium
```

---

## Schema de Supabase

```sql
-- Tabla knowledge_base
CREATE TABLE knowledge_base (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda eficiente
CREATE INDEX ON knowledge_base
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Tabla conversation_logs (opcional, para analytics)
CREATE TABLE conversation_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  bot_response TEXT NOT NULL,
  context_used JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Métricas de Calidad RAG

| Métrica | Objetivo | Cómo medir |
|---|---|---|
| Precisión de retrieval | > 80% chunks relevantes | Revisión manual de 20 queries |
| Tasa de "no sé" | < 20% | Logs de conversaciones |
| Latencia de búsqueda | < 500ms | Timing en retrieval.ts |
| Freshness de datos | < 7 días desde último update | `created_at` en KB |

---

## Checklist de Implementación RAG

- [ ] Base de conocimiento indexada en Supabase
- [ ] Función de búsqueda semántica probada
- [ ] System prompt incluye instrucciones de uso de contexto
- [ ] Chatbot responde "no sé" cuando el contexto es insuficiente
- [ ] Script de re-indexado documentado y funcional
- [ ] El cliente sabe cómo actualizar la KB sin tocar código
- [ ] Logs de conversaciones para análisis de calidad
