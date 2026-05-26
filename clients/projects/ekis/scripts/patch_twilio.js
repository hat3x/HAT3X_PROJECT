const https = require('https');

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMzIxMjMzOC0xN2NhLTQzODgtYWVlNC01NjJmMGE2Njc0ZGQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiODFiY2M3NDktZjFjYy00MzM4LWI5ODQtOWNlYWZjMmRiYWNkIiwiaWF0IjoxNzc2NjcwOTMyfQ.DeYI6CEkuOFKcb-ndkVWNsoGPSA1V3VJNh2DvwgLF88';
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

  const nodes = w.nodes.map(n => {
    if (n.name === 'Twilio WA Confirmación') {
      console.log('Found node, replacing with native Twilio node');
      return {
        id: n.id,
        name: 'Twilio WA Confirmación',
        type: 'n8n-nodes-base.twilio',
        typeVersion: 1,
        position: n.position,
        continueOnFail: false,
        parameters: {
          resource: 'sms',
          operation: 'send',
          from: 'whatsapp:+14155238886',
          to: '={{ "whatsapp:+34" + $("Parsear Crear Cita").first().json.telefono }}',
          message: '={{ "✅ Cita confirmada - Clínica Biodental\n\nHola " + $("Parsear Crear Cita").first().json.nombre + ", tu cita ha quedado confirmada:\n\n🦷 " + $("Parsear Crear Cita").first().json.servicio + "\n📅 " + $("Parsear Crear Cita").first().json.fecha + " a las " + $("Parsear Crear Cita").first().json.hora + "\n📍 Clínica Biodental, Colmenarejo\n\n¿Necesitas modificar o cancelar? Llámanos al mismo número.\n¡Hasta pronto!" }}'
        },
        credentials: {
          twilioApi: {
            id: 'ZSpxBSQ8osrO48UA',
            name: 'Twilio Biodental'
          }
        }
      };
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
