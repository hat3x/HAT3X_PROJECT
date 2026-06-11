const https = require('https');
const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMzIxMjMzOC0xN2NhLTQzODgtYWVlNC01NjJmMGE2Njc0ZGQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDRiNGRiNDMtZTkwYy00NjU3LTlmODEtM2FlNTA5ZmM5ZDM4IiwiaWF0IjoxNzgxMTA3OTk2fQ.ABeU_jd3EWPg0MTa3rN30_LKmmH_4KXQcgE77LNhXoY';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = https.request({
      hostname: 'hat3xia.app.n8n.cloud', path, method,
      headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const PREFIXED = '02:Parsear Argumentos';

async function run() {
  const { body: wf } = await api('GET', '/api/v1/workflows/pkwU41CWs0KVcvTF');

  wf.nodes = wf.nodes.map(n => {
    if (n.name !== '02:Twilio - Enviar WhatsApp') return n;

    n.credentials.twilioApi = { id: 'ZSpxBSQ8osrO48UA', name: 'Twilio Biodental' };

    // Rebuild to + body using the prefixed node name so n8n expressions resolve correctly
    n.parameters.to      = "=whatsapp:+34{{ $('" + PREFIXED + "').first().json.telefono }}";
    delete n.parameters.body;
    n.parameters.message = [
      "=✅ Cita confirmada - Clínica Biodental\n\n",
      "Hola {{ $('" + PREFIXED + "').first().json.nombre }}, tu cita ha quedado confirmada:\n\n",
      "📅 {{ $('" + PREFIXED + "').first().json.diaSemana }} {{ $('" + PREFIXED + "').first().json.diaMes }} de {{ $('" + PREFIXED + "').first().json.mes }} a las {{ $('" + PREFIXED + "').first().json.hora }}\n",
      "🦷 {{ $('" + PREFIXED + "').first().json.servicio }}\n",
      "📍 Clínica Biodental, Colmenarejo\n\n",
      "¿Necesitas cambiar o cancelar? Llámanos al mismo número.\n\n¡Hasta pronto!",
    ].join('');

    console.log('  credential:', n.credentials.twilioApi.name);
    console.log('  to:', n.parameters.to);
    return n;
  });

  process.stdout.write('PUT...');
  const put = await api('PUT', '/api/v1/workflows/pkwU41CWs0KVcvTF', {
    name: wf.name, nodes: wf.nodes, connections: wf.connections,
    settings: { executionOrder: 'v1' }, pinData: {}
  });
  if (put.status !== 200) { console.error(' ERR', put.status, JSON.stringify(put.body).substring(0, 300)); process.exit(1); }
  console.log(' OK');

  process.stdout.write('Activando...');
  const act = await api('POST', '/api/v1/workflows/pkwU41CWs0KVcvTF/activate');
  console.log(act.body?.active ? ' ACTIVO' : ' WARN: ' + JSON.stringify(act.body).substring(0, 300));
}

run().catch(e => { console.error(e.message); process.exit(1); });
