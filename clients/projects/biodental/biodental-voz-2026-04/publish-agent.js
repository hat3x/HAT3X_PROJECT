/**
 * Publica el borrador actual de un agente de Retell.
 *
 * Sustituye al endpoint retirado `POST /publish-agent/{agent_id}`
 * (deprecado el 2026-07-20). El endpoint nuevo exige el número de
 * versión en el cuerpo, así que hay que leerlo antes con get-agent.
 *
 * Uso: node publish-agent.js [agent_id]
 *   - agent_id: opcional, por defecto el de Sara (Biodental).
 *   - La clave se lee de RETELL_API_KEY (entorno) o del .env de al lado.
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const AGENT_ID = process.argv[2] || 'agent_afc17e11edd91d3b96930a6bef';

function leerClave() {
  if (process.env.RETELL_API_KEY) return process.env.RETELL_API_KEY;
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return null;
  for (const linea of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*RETELL_API_KEY\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

const RETELL_KEY = leerClave();
if (!RETELL_KEY) {
  console.error('❌ Falta RETELL_API_KEY (ni en el entorno ni en .env)');
  process.exit(1);
}

function llamar(metodo, ruta, cuerpo) {
  return new Promise((resolve, reject) => {
    const data = cuerpo ? JSON.stringify(cuerpo) : null;
    const headers = { 'Authorization': `Bearer ${RETELL_KEY}` };
    if (data) {
      headers['Content-Type']   = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = https.request(
      { hostname: 'api.retellai.com', path: ruta, method: metodo, headers },
      res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  // 1. Averiguar qué versión es el borrador.
  const info = await llamar('GET', `/get-agent/${AGENT_ID}`);
  if (info.status !== 200) {
    console.error('❌ No se pudo leer el agente:', info.status, info.body.substring(0, 300));
    process.exit(1);
  }
  const agente = JSON.parse(info.body);
  console.log(`Agente: ${agente.agent_name}`);
  console.log(`Versión en borrador: ${agente.version} (is_published: ${agente.is_published})`);

  if (agente.is_published) {
    console.log('ℹ️  Esta versión ya está publicada. Nada que hacer.');
    return;
  }

  // 2. Publicarla con el endpoint nuevo.
  const res = await llamar('POST', `/publish-agent-version/${AGENT_ID}`, { version: agente.version });
  if (res.status >= 200 && res.status < 300) {
    console.log(`✅ Publicada la versión ${agente.version} — ya la cogen las llamadas entrantes.`);
  } else {
    console.error('❌ Error al publicar:', res.status, res.body.substring(0, 300));
    process.exit(1);
  }
})().catch(e => { console.error('❌', e.message); process.exit(1); });
