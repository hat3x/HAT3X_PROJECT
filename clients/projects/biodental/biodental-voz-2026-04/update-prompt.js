/**
 * Sube el contenido de prompts/system-prompt.md como general_prompt
 * del LLM de Retell (Sara).
 *
 * Uso: node update-prompt.js
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const RETELL_KEY = 'key_554800de967c68158133e2a0b932';
const LLM_ID     = 'llm_c32d7ba946504725c5370078a095';

const prompt = fs.readFileSync(path.join(__dirname, 'prompts', 'system-prompt.md'), 'utf8');

const data = JSON.stringify({ general_prompt: prompt });

const req = https.request({
  hostname: 'api.retellai.com',
  path: `/update-retell-llm/${LLM_ID}`,
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${RETELL_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    if (res.statusCode === 200) {
      const j = JSON.parse(d);
      console.log('✅ Prompt actualizado — versión', j.version);
    } else {
      console.error('❌ Error', res.statusCode, d.substring(0, 300));
      process.exit(1);
    }
  });
});
req.on('error', e => { console.error('❌', e.message); process.exit(1); });
req.write(data);
req.end();
