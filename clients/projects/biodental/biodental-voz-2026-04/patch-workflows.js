const https = require('https');

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

const WORKFLOWS = [
  { id: 'ue1C8sJsEOm34EZO', name: 'WF01-verificar' },
  { id: 'QpkO6mLrLzLsqyOq', name: 'WF02-crear' },
  { id: '0IP8sum9CNBu5erx', name: 'WF03-cancelar' },
  { id: 'xYeFwDp700o5CStc', name: 'WF04-modificar' },
];

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: BASE, path, method,
      headers: {
        'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve(d); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const CAL_RL = { __rl: true, value: CALENDAR_ID, mode: 'list', cachedResultName: CALENDAR_ID };

function fixNode(n) {
  // Fix credentials
  if (n.credentials) {
    if (n.credentials.googleCalendarOAuth2Api)
      n.credentials.googleCalendarOAuth2Api = GCAL_CRED;
    if (n.credentials.googleSheetsOAuth2Api)
      n.credentials.googleSheetsOAuth2Api = GSHEETS_CRED;
  }

  if (n.type === 'n8n-nodes-base.googleCalendar') {
    const op = n.parameters.operation;
    // Replace calendarId with calendar (__rl list format)
    delete n.parameters.calendarId;
    n.parameters.calendar = CAL_RL;

    if (op === 'getAll') {
      // Move timeMin/timeMax from options to top-level
      const opts = n.parameters.options || {};
      n.parameters.timeMin = opts.timeMin || '={{ $json.fechaInicio }}';
      n.parameters.timeMax = opts.timeMax || '={{ $json.fechaFin }}';
      n.parameters.options = { singleEvents: true };
    }
    // Reorder: operation first, calendar second
    const p = n.parameters;
    n.parameters = { operation: p.operation, calendar: p.calendar, ...p };
  }

  // Hardcode sheets ID
  if (n.parameters && n.parameters.documentId && n.parameters.documentId.value === '={{ $env.BIODENTAL_SHEETS_ID }}')
    n.parameters.documentId.value = SHEETS_ID;

  // Fix Sheets append nodes: replace defineBelow (requires schema cache) with autoMapInputData
  if (n.type === 'n8n-nodes-base.googleSheets' && n.parameters.columns?.mappingMode === 'defineBelow') {
    n.parameters.columns = { mappingMode: 'autoMapInputData', value: {}, schema: [] };
  }

  // Fix Sheets read nodes: mode:"name" fails at runtime in this n8n version.
  // Solution: typeVersion 4.6, no operation field, mode:"list" with numeric GID.
  if (n.type === 'n8n-nodes-base.googleSheets' && n.name === 'Google Sheets - Leer Citas') {
    n.typeVersion = 4.6;
    delete n.parameters.operation;
    n.parameters.sheetName = {
      __rl: true, value: 0, mode: 'list', cachedResultName: 'Citas',
      cachedResultUrl: 'https://docs.google.com/spreadsheets/d/' + SHEETS_ID + '/edit#gid=0'
    };
  }

  // Always output data from googleCalendar getAll so downstream code runs with 0 results
  if (n.type === 'n8n-nodes-base.googleCalendar' && n.parameters.operation === 'getAll') {
    n.alwaysOutputData = true;
  }

  return n;
}

// Rewrite WF02 code node to output keys that match Sheets column headers for autoMapInputData
function fixWF02CodeNode(nodes) {
  return nodes.map(n => {
    if (n.name === 'Añadir Calendar Event ID') {
      n.parameters.jsCode = [
        "const gcal = $('Google Calendar - Crear Evento').first().json;",
        "const datos = $('Parsear Argumentos').first().json;",
        "const now = new Date().toISOString().replace('T',' ').substring(0,19);",
        "return [{ json: {",
        "  'ID': gcal.id || '',",
        "  'Nombre': datos.nombre,",
        "  'Teléfono': datos.telefono,",
        "  'Servicio': datos.servicio,",
        "  'Fecha': datos.fecha,",
        "  'Hora': datos.hora,",
        "  'Duración': datos.duracion,",
        "  'Estado': 'CONFIRMADA',",
        "  'Notas': datos.notas || '',",
        "  'Calendar_Event_ID': gcal.id || '',",
        "  'Creada_en': now,",
        "  nombre: datos.nombre, telefono: datos.telefono, servicio: datos.servicio,",
        "  fecha: datos.fecha, hora: datos.hora, duracion: datos.duracion,",
        "  notas: datos.notas || '', calendar_event_id: gcal.id || '',",
        "  diaSemana: datos.diaSemana, diaMes: datos.diaMes, mes: datos.mes",
        "}}];"
      ].join('\n');
    }
    return n;
  });
}

async function run() {
  for (const wf of WORKFLOWS) {
    const w = await req('GET', `/api/v1/workflows/${wf.id}`);
    let nodes = w.nodes.map(fixNode);
    if (wf.name === 'WF02-crear') nodes = fixWF02CodeNode(nodes);
    const patched = { name: w.name, nodes, connections: w.connections, settings: w.settings || {}, pinData: w.pinData || {} };
    await req('PUT', `/api/v1/workflows/${wf.id}`, patched);
    const actRes = await req('POST', `/api/v1/workflows/${wf.id}/activate`);
    console.log(`${wf.name}: active=${actRes.active} ${actRes.message ? '| ' + actRes.message.substring(0, 100) : '✅'}`);
  }
}

run().catch(console.error);
