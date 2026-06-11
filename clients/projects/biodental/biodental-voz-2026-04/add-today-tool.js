/**
 * Añade la tool `toDay` al LLM de Retell AI de Biodental.
 *
 * Requisito previo: el workflow 00-today.json debe estar activo en n8n
 * y su Production URL debe estar en .env como N8N_TODAY_URL.
 *
 * Uso: node add-today-tool.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// --- Leer .env ---
function readEnv(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    env[key] = val;
  }
  return env;
}

const envPath = path.join(__dirname, '.env');
const env = readEnv(envPath);

const RETELL_API_KEY = env.RETELL_API_KEY;
const RETELL_LLM_ID  = env.RETELL_LLM_ID;
const TODAY_URL       = env.N8N_TODAY_URL;

if (!RETELL_API_KEY) { console.error('❌  RETELL_API_KEY no está en .env'); process.exit(1); }
if (!RETELL_LLM_ID)  { console.error('❌  RETELL_LLM_ID no está en .env');  process.exit(1); }
if (!TODAY_URL)       { console.error('❌  N8N_TODAY_URL no está en .env — activa el workflow 00-today en n8n y copia la URL'); process.exit(1); }

// --- HTTP helper ---
function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.retellai.com',
      path: urlPath,
      method,
      headers: {
        Authorization: `Bearer ${RETELL_API_KEY}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// --- Tool definition para toDay ---
const TODAY_TOOL = {
  type: 'custom',
  name: 'toDay',
  description: 'Devuelve la fecha y hora actuales en España (Madrid). Llamar al inicio de cada llamada y siempre que se necesite saber qué día es hoy para calcular fechas relativas (mañana, pasado mañana, esta semana, etc.). Nunca asumir la fecha — siempre consultarla.',
  speak_during_execution: false,
  url: TODAY_URL,
  parameters: {
    type: 'object',
    properties: {},
  },
};

async function run() {
  // 1. Obtener LLM actual
  console.log(`\n📥  Leyendo LLM ${RETELL_LLM_ID}...`);
  const getRes = await req('GET', `/get-retell-llm/${RETELL_LLM_ID}`);
  if (getRes.status !== 200) {
    console.error(`❌  Error al leer el LLM (${getRes.status}):`, JSON.stringify(getRes.body, null, 2));
    process.exit(1);
  }

  const llm = getRes.body;
  const tools = llm.general_tools || [];

  // 2. Comprobar si toDay ya existe
  const yaExiste = tools.some(t => t.name === 'toDay');
  if (yaExiste) {
    console.log('⚠️   La tool toDay ya existe en el LLM. Actualizando su URL...');
    const idx = tools.findIndex(t => t.name === 'toDay');
    tools[idx] = TODAY_TOOL;
  } else {
    // Añadir toDay al principio (antes de verificar_disponibilidad)
    tools.unshift(TODAY_TOOL);
    console.log(`✅  Añadiendo toDay al LLM. Total tools: ${tools.length}`);
  }

  // 3. Preparar payload de actualización
  const payload = { general_tools: tools };

  // 4. Aplicar PATCH
  console.log(`\n📤  Actualizando LLM...`);
  const patchRes = await req('PATCH', `/update-retell-llm/${RETELL_LLM_ID}`, payload);

  if (patchRes.status !== 200) {
    console.error(`❌  Error al actualizar (${patchRes.status}):`, JSON.stringify(patchRes.body, null, 2));
    process.exit(1);
  }

  // 5. Verificar que las tools quedaron bien
  const updatedTools = patchRes.body.general_tools || [];
  console.log('\n✅  LLM actualizado correctamente.');
  console.log('\nTools activas:');
  updatedTools.forEach((t, i) => {
    const url = t.url ? ` → ${t.url.substring(0, 60)}...` : '';
    console.log(`  ${i + 1}. [${t.type}] ${t.name}${url}`);
  });
}

run().catch(err => {
  console.error('❌  Error inesperado:', err.message);
  process.exit(1);
});
