const https = require('https');

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMzIxMjMzOC0xN2NhLTQzODgtYWVlNC01NjJmMGE2Njc0ZGQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiODFiY2M3NDktZjFjYy00MzM4LWI5ODQtOWNlYWZjMmRiYWNkIiwiaWF0IjoxNzc2NjcwOTMyfQ.DeYI6CEkuOFKcb-ndkVWNsoGPSA1V3VJNh2DvwgLF88';
const RETELL_KEY = 'key_554800de967c68158133e2a0b932';
const LLM_ID = 'llm_c32d7ba946504725c5370078a095';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'hat3xia.app.n8n.cloud', path, method,
      headers: {
        'X-N8N-API-KEY': N8N_KEY,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const codeDate = `
const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const now = new Date();
const dia = now.getDate();
const mes = meses[now.getMonth()];
const anio = now.getFullYear();
const diaSemana = dias[now.getDay()];
return [{ json: {
  textoFecha: 'La fecha de hoy es ' + diaSemana + ' ' + dia + ' de ' + mes + ' de ' + anio + '.',
  anio: String(anio)
} }];
`;

const codeBuild = `
const llm = $('Obtener Prompt Actual').first().json;
const { textoFecha, anio } = $('Generar Fecha Española').first().json;

let prompt = llm.general_prompt || '';
// Remove previous date line if present
prompt = prompt.replace(/^La fecha de hoy[^\\n]*\\n\\n/, '');

const datePrefix = textoFecha + ' Cuando el paciente mencione dias relativos (mañana, pasado mañana, la semana que viene), calcúlalos siempre desde hoy. Usa SIEMPRE el año ' + anio + ' para todas las citas.\\n\\n';

return [{ json: {
  general_prompt: datePrefix + prompt,
  model: llm.model,
  begin_message: llm.begin_message,
  general_tools: llm.general_tools
} }];
`;

const workflow = {
  name: 'Biodental — Actualizar Fecha Retell LLM',
  nodes: [
    {
      id: 'n1',
      name: 'Cron Diario 7am',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [-400, 300],
      parameters: {
        rule: {
          interval: [{ field: 'hours', hoursInterval: 24, triggerAtHour: 7 }]
        }
      }
    },
    {
      id: 'n2',
      name: 'Generar Fecha Española',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-200, 300],
      parameters: { jsCode: codeDate }
    },
    {
      id: 'n3',
      name: 'Obtener Prompt Actual',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [0, 300],
      parameters: {
        method: 'GET',
        url: 'https://api.retellai.com/get-retell-llm/' + LLM_ID,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'Authorization', value: 'Bearer ' + RETELL_KEY }]
        },
        options: {}
      }
    },
    {
      id: 'n4',
      name: 'Construir Nuevo Prompt',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [200, 300],
      parameters: { jsCode: codeBuild }
    },
    {
      id: 'n5',
      name: 'Actualizar Retell LLM',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [400, 300],
      parameters: {
        method: 'PATCH',
        url: 'https://api.retellai.com/update-retell-llm/' + LLM_ID,
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'Authorization', value: 'Bearer ' + RETELL_KEY }]
        },
        sendBody: true,
        contentType: 'json',
        body: '={{ JSON.stringify($json) }}',
        options: {}
      }
    }
  ],
  connections: {
    'Cron Diario 7am':        { main: [[{ node: 'Generar Fecha Española', type: 'main', index: 0 }]] },
    'Generar Fecha Española':  { main: [[{ node: 'Obtener Prompt Actual',  type: 'main', index: 0 }]] },
    'Obtener Prompt Actual':   { main: [[{ node: 'Construir Nuevo Prompt', type: 'main', index: 0 }]] },
    'Construir Nuevo Prompt':  { main: [[{ node: 'Actualizar Retell LLM',  type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1' }
};

async function run() {
  // Clean up any previous version
  const list = await req('GET', '/api/v1/workflows?limit=50');
  for (const w of (list.data || [])) {
    if (w.name === workflow.name) {
      await req('DELETE', '/api/v1/workflows/' + w.id);
      console.log('Deleted old workflow:', w.id);
    }
  }

  const result = await req('POST', '/api/v1/workflows', workflow);
  if (!result.id) {
    console.error('Create failed:', JSON.stringify(result).substring(0, 300));
    return;
  }
  console.log('Created workflow:', result.id, result.name);

  const act = await req('POST', '/api/v1/workflows/' + result.id + '/activate');
  console.log('Activated:', act.active, act.message || '✅');
}

run().catch(console.error);
