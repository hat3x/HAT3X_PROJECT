/**
 * Sube los 5 workflows de Biodental a n8n cloud vía API.
 * - WF00 (toDay):          crea nuevo  (POST)
 * - WF01-04 (existentes):  actualiza   (PUT)
 * Aplica las mismas transformaciones de credenciales y formato que patch-workflows.js
 *
 * Uso: node update-all-workflows.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ── Constantes n8n ────────────────────────────────────────────────────────────
const N8N_KEY = process.env.N8N_API_KEY;
if (!N8N_KEY) {
  console.error('Falta N8N_API_KEY. Exportala antes de ejecutar este script:');
  console.error('  export N8N_API_KEY="..."   (o $env:N8N_API_KEY="..." en PowerShell)');
  process.exit(1);
}
const BASE = 'hat3xia.app.n8n.cloud';
const GCAL_CRED = { id: 'KxXdXUleISCLDdUl', name: 'd9a9' };
const GSHEETS_CRED = { id: 'EJ0DSUb87ZX7u8RL', name: 'Google Sheets OAuth2 API' };
const CALENDAR_ID = 'primary';
const SHEETS_ID = '13dgSeExFfpPyFJ-ZIXuLQ5uN-A5F7gcy6dHL1SxoxmY';
const CAL_RL = { __rl: true, value: CALENDAR_ID, mode: 'list', cachedResultName: CALENDAR_ID };

// WF00 se creó dos veces; eliminamos el duplicado y usamos el último
const WF00_DUPLICATE_TO_DELETE = 'AcSfhNwHakHAZzEp';

const WORKFLOWS = [
  { file: '00-today.json',                    id: 'uraDf7JWgnslu8y0', label: 'WF00-today'    },
  { file: '01-verificar-disponibilidad.json', id: 'ue1C8sJsEOm34EZO', label: 'WF01-verificar'},
  { file: '02-crear-cita.json',               id: 'QpkO6mLrLzLsqyOq', label: 'WF02-crear'    },
  { file: '03-cancelar-cita.json',            id: '0IP8sum9CNBu5erx', label: 'WF03-cancelar' },
  { file: '04-modificar-cita.json',           id: 'xYeFwDp700o5CStc', label: 'WF04-modificar'},
];

// ── HTTP ──────────────────────────────────────────────────────────────────────
function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: BASE, path: urlPath, method,
      headers: {
        'X-N8N-API-KEY': N8N_KEY,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// ── Transformaciones de nodos ──────────────────────────────────────────────────
function fixNode(n) {
  // Credenciales reales
  if (n.credentials?.googleCalendarOAuth2Api) n.credentials.googleCalendarOAuth2Api = GCAL_CRED;
  if (n.credentials?.googleSheetsOAuth2Api) n.credentials.googleSheetsOAuth2Api = GSHEETS_CRED;

  // Google Calendar: calendarId → calendar (__rl)
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
    // Reordenar: operation primero, calendar segundo
    const p = n.parameters;
    n.parameters = { operation: p.operation, calendar: p.calendar, ...p };
  }

  // Google Sheets: sustituir env var con ID real
  if (n.parameters?.documentId?.value === '={{ $env.BIODENTAL_SHEETS_ID }}')
    n.parameters.documentId.value = SHEETS_ID;

  // Google Sheets — nodo de lectura: typeVersion 4.6 + sheetName en modo list
  if (n.type === 'n8n-nodes-base.googleSheets' && n.name === 'Google Sheets - Leer Citas') {
    n.typeVersion = 4.6;
    delete n.parameters.operation;
    n.parameters.sheetName = {
      __rl: true, value: 0, mode: 'list', cachedResultName: 'Citas',
      cachedResultUrl: `https://docs.google.com/spreadsheets/d/${SHEETS_ID}/edit#gid=0`,
    };
  }

  // Google Sheets — nodos con defineBelow: convertir a autoMapInputData
  if (n.type === 'n8n-nodes-base.googleSheets' && n.parameters.columns?.mappingMode === 'defineBelow')
    n.parameters.columns = { mappingMode: 'autoMapInputData', value: {}, schema: [] };

  return n;
}

// WF02: el nodo "Añadir Calendar Event ID" debe emitir los nombres de columna
// exactos para que autoMapInputData los mapee correctamente a Google Sheets
function fixWF02CodeNode(nodes) {
  return nodes.map(n => {
    if (n.name !== 'Añadir Calendar Event ID') return n;
    n.parameters.jsCode = [
      "const gcal = $('Google Calendar - Crear Evento').first().json;",
      "const datos = $('Parsear Argumentos').first().json;",
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

  // 1. Eliminar WF00 duplicado que causa conflicto de webhook
  process.stdout.write(`\nEliminando WF00 duplicado (${WF00_DUPLICATE_TO_DELETE})...`);
  const delRes = await req('DELETE', `/api/v1/workflows/${WF00_DUPLICATE_TO_DELETE}`);
  console.log(delRes.status === 200 ? ' ✅' : ` (${delRes.status} — ya no existe, ok)`);

  // 2. Desactivar todos antes de actualizar para liberar los paths de webhook
  process.stdout.write('Desactivando todos los workflows...');
  for (const wf of WORKFLOWS) {
    await req('POST', `/api/v1/workflows/${wf.id}/deactivate`);
  }
  console.log(' ✅');

  for (const wf of WORKFLOWS) {
    process.stdout.write(`\n${wf.label}: `);

    const raw = fs.readFileSync(path.join(n8nDir, wf.file), 'utf8');
    const workflow = JSON.parse(raw);

    let nodes = workflow.nodes.map(fixNode);
    if (wf.label === 'WF02-crear') nodes = fixWF02CodeNode(nodes);

    const payload = {
      name: workflow.name,
      nodes,
      connections: workflow.connections,
      settings: workflow.settings || {},
      pinData: workflow.pinData || {},
    };

    // Desarchivar si es necesario (n8n bloquea PUT en workflows archivados)
    const unarchiveRes = await req('POST', `/api/v1/workflows/${wf.id}/unarchive`);
    if (unarchiveRes.status === 200) process.stdout.write('desarchivado → ');

    const res = await req('PUT', `/api/v1/workflows/${wf.id}`, payload);
    if (res.status !== 200) {
      console.log(`❌ Error al actualizar (${res.status}):`, JSON.stringify(res.body).substring(0, 200));
      continue;
    }
    const wfId = wf.id;
    console.log('actualizado');

    // Activar
    const actRes = await req('POST', `/api/v1/workflows/${wfId}/activate`);
    const ok = actRes.body?.active === true;
    console.log(`  → ${ok ? '✅ activo' : '⚠️  ' + JSON.stringify(actRes.body).substring(0, 100)}`);
  }

  console.log('\n─────────────────────────────────────────────');
  console.log('✅ Hecho. Próximos pasos:');
  console.log('   1. Copia la Production URL del webhook "Biodental — toDay" desde n8n');
  console.log('   2. Añádela a .env como N8N_TODAY_URL=<url>');
  console.log('   3. Ejecuta: node add-today-tool.js');
}

run().catch(err => { console.error('\n❌ Error inesperado:', err.message); process.exit(1); });
