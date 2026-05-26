# SKILL: Integración CRM

## CRMs soportados en HAT3X

| CRM | Cuándo usarlo | API |
|---|---|---|
| **HubSpot** | Default — gratuito, bien documentado, muy común | REST + Webhooks |
| **Pipedrive** | Clientes enfocados en ventas B2B | REST |
| **Salesforce** | Clientes enterprise (evitar si no es necesario) | REST + SOQL |
| **Notion** | Clientes pequeños sin CRM formal | REST |

---

## HubSpot — Operaciones Frecuentes

### Setup
```env
HUBSPOT_ACCESS_TOKEN=pat-xxx  # Private App Token (no OAuth para proyectos simples)
HUBSPOT_PORTAL_ID=12345678
```

### Crear/actualizar contacto
```typescript
import { Client } from '@hubspot/api-client';

const hubspot = new Client({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN });

// Crear o actualizar por email (upsert)
async function upsertContact(data: {
  email: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  company?: string;
  hs_lead_status?: string;  // NEW, OPEN, IN_PROGRESS, etc.
  [key: string]: string | undefined;
}) {
  try {
    // Buscar si existe
    const search = await hubspot.crm.contacts.searchApi.doSearch({
      filterGroups: [{
        filters: [{ propertyName: 'email', operator: 'EQ', value: data.email }]
      }],
      properties: ['email', 'hs_object_id'],
      limit: 1,
      after: 0,
      sorts: []
    });

    if (search.results.length > 0) {
      // Actualizar
      return hubspot.crm.contacts.basicApi.update(
        search.results[0].id,
        { properties: data }
      );
    } else {
      // Crear
      return hubspot.crm.contacts.basicApi.create({ properties: data });
    }
  } catch (e) {
    console.error('HubSpot upsert error:', e);
    throw e;
  }
}
```

### Crear deal (oportunidad)
```typescript
async function createDeal(params: {
  contactId: string;
  dealname: string;
  amount?: number;
  dealstage?: string;  // 'appointmentscheduled' | 'qualifiedtobuy' | 'closedwon'
  pipeline?: string;
}) {
  const deal = await hubspot.crm.deals.basicApi.create({
    properties: {
      dealname: params.dealname,
      amount: params.amount?.toString(),
      dealstage: params.dealstage || 'appointmentscheduled',
      pipeline: params.pipeline || 'default'
    }
  });

  // Asociar con contacto
  await hubspot.crm.deals.associationsApi.create(
    deal.id,
    'contacts',
    params.contactId,
    [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }]
  );

  return deal;
}
```

### Crear nota (log de llamada/chat)
```typescript
async function logNote(contactId: string, content: string) {
  const note = await hubspot.crm.objects.notes.basicApi.create({
    properties: {
      hs_note_body: content,
      hs_timestamp: new Date().toISOString()
    }
  });

  await hubspot.crm.objects.notes.associationsApi.create(
    note.id,
    'contacts',
    contactId,
    [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
  );
}
```

---

## Pipedrive — Operaciones Frecuentes

```env
PIPEDRIVE_API_TOKEN=xxx
PIPEDRIVE_COMPANY_DOMAIN=tuempresa  # tuempresa.pipedrive.com
```

```typescript
const BASE_URL = `https://${process.env.PIPEDRIVE_COMPANY_DOMAIN}.pipedrive.com/api/v1`;

// Crear persona (contacto)
async function createPerson(data: {
  name: string;
  email?: string[];
  phone?: string[];
}) {
  const res = await fetch(`${BASE_URL}/persons?api_token=${process.env.PIPEDRIVE_API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

// Crear deal
async function createDeal(params: {
  title: string;
  person_id?: number;
  value?: number;
  stage_id?: number;
}) {
  const res = await fetch(`${BASE_URL}/deals?api_token=${process.env.PIPEDRIVE_API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return res.json();
}
```

---

## Integración desde n8n

Para la mayoría de proyectos, las integraciones CRM se hacen via n8n:

### Nodos útiles en n8n
- **HubSpot node** — operaciones CRUD sobre contacts, deals, companies
- **HTTP Request node** — para Pipedrive u otros CRMs con API REST
- **Webhook node** — recibir eventos desde el CRM (contact created, deal updated)

### Patrón estándar en n8n para registrar lead
```
Webhook (trigger) →
Set node (normalizar datos) →
HubSpot: Search Contact (¿existe?) →
IF: existe →
  HubSpot: Update Contact
IF: no existe →
  HubSpot: Create Contact →
  HubSpot: Create Deal →
  Send Email (notificación al comercial)
```

---

## Propiedades Personalizadas HAT3X

Para proyectos donde el CRM del cliente no tiene los campos necesarios,
crear propiedades personalizadas con prefijo `hat3x_`:

```typescript
// HubSpot — crear propiedad custom
await hubspot.crm.properties.coreApi.create('contacts', {
  name: 'hat3x_lead_source_detail',
  label: 'HAT3X Lead Source Detail',
  type: 'string',
  fieldType: 'text',
  groupName: 'contactinformation'
});
```

---

## Variables de Entorno Necesarias

```env
# HubSpot
HUBSPOT_ACCESS_TOKEN=pat-xxx
HUBSPOT_PORTAL_ID=12345678

# Pipedrive
PIPEDRIVE_API_TOKEN=xxx
PIPEDRIVE_COMPANY_DOMAIN=tuempresa

# Salesforce (solo si aplica)
SALESFORCE_CLIENT_ID=xxx
SALESFORCE_CLIENT_SECRET=xxx
SALESFORCE_INSTANCE_URL=https://tuempresa.salesforce.com
```

---

## Checklist de Integración CRM

- [ ] Credenciales configuradas en `.env` (nunca hardcodeadas)
- [ ] Rate limits verificados (HubSpot: 100 req/10s en plan free)
- [ ] Manejo de errores implementado — CRM puede estar caído
- [ ] Deduplicación por email implementada (no crear contactos duplicados)
- [ ] Probado con datos reales del cliente
- [ ] El cliente tiene acceso al CRM y sabe ver los datos registrados
