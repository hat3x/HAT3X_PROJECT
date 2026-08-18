const https = require('https');

const N8N_KEY = process.env.N8N_API_KEY;
if (!N8N_KEY) {
  console.error('Falta N8N_API_KEY. Exportala antes de ejecutar este script:');
  console.error('  export N8N_API_KEY="..."   (o $env:N8N_API_KEY="..." en PowerShell)');
  process.exit(1);
}
const WF_ID = 'pkwU41CWs0KVcvTF';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'hat3xia.app.n8n.cloud', path, method,
      headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
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

async function run() {
  const w = await req('GET', `/api/v1/workflows/${WF_ID}`);

  const PARSEAR_NODES = ['Parsear Disponibilidad', 'Parsear Crear Cita', 'Parsear Cancelar Cita', 'Parsear Modificar Cita'];

  const nodes = w.nodes.map(n => {
    if (!PARSEAR_NODES.includes(n.name)) return n;

    const oldCode = n.parameters.jsCode || '';
    // Replace the args resolution block: try raw.args first, then raw.arguments, then raw
    const newCode = oldCode.replace(
      /if \(raw\.arguments !== undefined\) \{\s*(\w+) = typeof raw\.arguments === 'string' \? JSON\.parse\(raw\.arguments\) : raw\.arguments;\s*\} else \{\s*\1 = raw;\s*\}/,
      (match, v) => {
        return `const _p = raw.args !== undefined ? raw.args : (raw.arguments !== undefined ? raw.arguments : raw);\n${v} = typeof _p === 'string' ? JSON.parse(_p) : _p;`;
      }
    );

    if (newCode !== oldCode) {
      console.log(`Fixed: ${n.name}`);
      n.parameters.jsCode = newCode;
    } else {
      console.log(`No change needed or pattern not matched: ${n.name}`);
    }
    return n;
  });

  const patched = { name: w.name, nodes, connections: w.connections, settings: { executionOrder: 'v1' }, pinData: w.pinData || {} };

  await req('POST', `/api/v1/workflows/${WF_ID}/deactivate`);
  console.log('Deactivated');

  const result = await req('PUT', `/api/v1/workflows/${WF_ID}`, patched);
  console.log('PUT result:', result.id ? 'OK id=' + result.id : JSON.stringify(result).substring(0, 300));

  const actResult = await req('POST', `/api/v1/workflows/${WF_ID}/activate`);
  console.log('Activated:', actResult.active, actResult.message || '✅');
}

run().catch(console.error);
