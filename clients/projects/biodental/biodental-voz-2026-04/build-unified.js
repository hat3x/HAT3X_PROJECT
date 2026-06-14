/**
 * Construye el workflow unificado de Biodental (5 webhooks en 1) y lo sube a n8n.
 * Lee los 5 JSONs individuales, prefija los nodos, fusiona y hace PUT al workflow
 * existente pkwU41CWs0KVcvTF.
 *
 * Uso: node build-unified.js
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── n8n ───────────────────────────────────────────────────────────────────────
const N8N_KEY       = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMzIxMjMzOC0xN2NhLTQzODgtYWVlNC01NjJmMGE2Njc0ZGQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDRiNGRiNDMtZTkwYy00NjU3LTlmODEtM2FlNTA5ZmM5ZDM4IiwiaWF0IjoxNzgxMTA3OTk2fQ.ABeU_jd3EWPg0MTa3rN30_LKmmH_4KXQcgE77LNhXoY';
const BASE          = 'hat3xia.app.n8n.cloud';
const UNIFIED_ID    = 'pkwU41CWs0KVcvTF';
const GCAL_CRED     = { id: 'vjjm2x8bmRYXXbWo', name: 'ekis' };
const GSHEETS_CRED  = { id: 'EJ0DSUb87ZX7u8RL', name: 'Google Sheets OAuth2 API' };
const TWILIO_CRED   = { id: 'ZSpxBSQ8osrO48UA', name: 'Twilio Biodental' };
const CALENDAR_ID   = 'primary';
const SHEETS_ID     = '13dgSeExFfpPyFJ-ZIXuLQ5uN-A5F7gcy6dHL1SxoxmY';
const CAL_RL        = { __rl: true, value: CALENDAR_ID, mode: 'list', cachedResultName: CALENDAR_ID };

// ── Flujos: prefijo de nodo + desplazamiento vertical ─────────────────────────
const FLOWS = [
  { file: '00-today.json',                    prefix: '00', yOffset: 0    },
  { file: '01-verificar-disponibilidad.json', prefix: '01', yOffset: 300  },
  { file: '02-crear-cita.json',               prefix: '02', yOffset: 700  },
  { file: '03-cancelar-cita.json',            prefix: '03', yOffset: 1200 },
  { file: '04-modificar-cita.json',           prefix: '04', yOffset: 1600 },
];

// ── HTTP ──────────────────────────────────────────────────────────────────────
function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: BASE, path: urlPath, method,
      headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
    };
    const r = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ── Renombra nodos de un flujo y actualiza referencias internas ───────────────
function renameFlow(workflow, prefix, yOffset) {
  const nameMap = {};
  for (const n of workflow.nodes) nameMap[n.name] = `${prefix}:${n.name}`;

  const nodes = workflow.nodes.map(n => {
    const node = JSON.parse(JSON.stringify(n));
    node.name = nameMap[n.name];
    node.id   = `${prefix}-${n.id}`;
    node.position = [n.position[0], (n.position[1] || 300) + yOffset];

    // Prefijar referencias $('Nodo') en TODOS los parámetros string del nodo
    // (jsCode, responseBody, to/message de Twilio, expresiones en options, etc.)
    function prefixRefs(value) {
      if (typeof value === 'string') {
        let s = value;
        for (const [old, nw] of Object.entries(nameMap))
          s = s.replace(new RegExp(`\\$\\('${esc(old)}'\\)`, 'g'), `$('${nw}')`);
        return s;
      }
      if (Array.isArray(value)) return value.map(prefixRefs);
      if (value && typeof value === 'object') {
        for (const k of Object.keys(value)) value[k] = prefixRefs(value[k]);
        return value;
      }
      return value;
    }
    node.parameters = prefixRefs(node.parameters);

    return node;
  });

  const connections = {};
  for (const [nodeName, conns] of Object.entries(workflow.connections || {})) {
    const newName = nameMap[nodeName] || nodeName;
    connections[newName] = {};
    for (const [connType, outputs] of Object.entries(conns)) {
      connections[newName][connType] = outputs.map(branch =>
        branch.map(c => ({ ...c, node: nameMap[c.node] || c.node }))
      );
    }
  }

  return { nodes, connections };
}

// ── Transformaciones de credenciales y formato de nodos ───────────────────────
function fixNode(n) {
  if (n.credentials?.googleCalendarOAuth2Api) n.credentials.googleCalendarOAuth2Api = GCAL_CRED;
  if (n.credentials?.googleSheetsOAuth2Api)   n.credentials.googleSheetsOAuth2Api   = GSHEETS_CRED;
  if (n.credentials?.twilioApi)               n.credentials.twilioApi               = TWILIO_CRED;

  if (n.type === 'n8n-nodes-base.googleCalendar') {
    delete n.parameters.calendarId;
    n.parameters.calendar = CAL_RL;
    if (n.parameters.operation === 'getAll') {
      const opts = n.parameters.options || {};
      n.parameters.timeMin = opts.timeMin;
      n.parameters.timeMax = opts.timeMax;
      n.parameters.options = { singleEvents: true };
      n.alwaysOutputData = true;
    }
    const p = n.parameters;
    n.parameters = { operation: p.operation, calendar: p.calendar, ...p };
  }

  if (n.parameters?.documentId?.value === '={{ $env.BIODENTAL_SHEETS_ID }}')
    n.parameters.documentId.value = SHEETS_ID;

  if (n.type === 'n8n-nodes-base.googleSheets' && n.name.includes('Leer Citas')) {
    n.typeVersion = 4.6;
    delete n.parameters.operation;
    n.parameters.sheetName = {
      __rl: true, value: 0, mode: 'list', cachedResultName: 'Citas',
      cachedResultUrl: `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/edit#gid=0`,
    };
  }

  if (n.type === 'n8n-nodes-base.googleSheets' && n.parameters.columns?.mappingMode === 'defineBelow')
    n.parameters.columns = { mappingMode: 'autoMapInputData', value: {}, schema: [] };

  return n;
}

// ── WF02: emitir nombres de columna exactos para autoMapInputData ─────────────
function fixWF02CodeNode(nodes) {
  return nodes.map(n => {
    if (!n.name.includes('Añadir Calendar Event ID')) return n;
    const parsearName    = n.name.replace('Añadir Calendar Event ID', 'Parsear Argumentos');
    const gcalCreateName = n.name.replace('Añadir Calendar Event ID', 'Google Calendar - Crear Evento');
    n.parameters.jsCode = [
      `const gcal = $('${gcalCreateName}').first().json;`,
      `const datos = $('${parsearName}').first().json;`,
      "if (!gcal.id) {",
      "  return [{ json: { error: 'calendar_error', confirmado: false,",
      "    mensaje: 'Ha habido un problema al guardar la cita en el calendario. ¿Quieres que lo intentemos de nuevo?' }}];",
      "}",
      "const now = new Date().toISOString().replace('T',' ').substring(0,19);",
      "return [{ json: {",
      "  'ID': gcal.id,",
      "  'Nombre': datos.nombre,",
      "  'Teléfono': datos.telefono,",
      "  'Servicio': datos.servicio,",
      "  'Fecha': datos.fecha,",
      "  'Hora': datos.hora,",
      "  'Duración': datos.duracion,",
      "  'Estado': 'CONFIRMADA',",
      "  'Notas': datos.notas || '',",
      "  'Calendar_Event_ID': gcal.id,",
      "  'Creada_en': now,",
      "  nombre: datos.nombre, telefono: datos.telefono, servicio: datos.servicio,",
      "  fecha: datos.fecha, hora: datos.hora, duracion: datos.duracion,",
      "  notas: datos.notas || '', calendar_event_id: gcal.id,",
      "  diaSemana: datos.diaSemana, diaMes: datos.diaMes, mes: datos.mes",
      "}}];",
    ].join('\n');
    return n;
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const n8nDir = path.join(__dirname, 'n8n');

  const allNodes       = [];
  const allConnections = {};

  for (const flow of FLOWS) {
    const workflow = JSON.parse(fs.readFileSync(path.join(n8nDir, flow.file), 'utf8'));
    const renamed  = renameFlow(workflow, flow.prefix, flow.yOffset);
    allNodes.push(...renamed.nodes);
    Object.assign(allConnections, renamed.connections);
    console.log(`  ✔ ${flow.prefix} — ${renamed.nodes.length} nodos`);
  }

  let nodes = allNodes.map(fixNode);
  nodes = fixWF02CodeNode(nodes);
  console.log(`\nTotal nodos: ${nodes.length}`);

  const payload = {
    name:        'Biodental — Recepcionista IA',
    nodes,
    connections: allConnections,
    settings:    { executionOrder: 'v1' },
    pinData:     {},
  };

  await req('POST', `/api/v1/workflows/${UNIFIED_ID}/deactivate`);

  process.stdout.write(`Subiendo a ${UNIFIED_ID}...`);
  const res = await req('PUT', `/api/v1/workflows/${UNIFIED_ID}`, payload);
  if (res.status !== 200) {
    console.error(`\n❌ Error (${res.status}):`, JSON.stringify(res.body).substring(0, 300));
    process.exit(1);
  }
  console.log(' ✅');

  const actRes = await req('POST', `/api/v1/workflows/${UNIFIED_ID}/activate`);
  console.log(actRes.body?.active ? '✅ Activo' : `⚠️  ${JSON.stringify(actRes.body).substring(0, 150)}`);

  console.log('\nPróximos pasos:');
  console.log('  1. Copia la Production URL del webhook "00:Retell Tool Call" desde n8n → N8N_TODAY_URL en .env');
  console.log('  2. node add-today-tool.js');
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
