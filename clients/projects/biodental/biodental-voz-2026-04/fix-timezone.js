/**
 * Corrige el bug de zona horaria en WF01 y WF04.
 * El servidor n8n usa UTC; sin corrección, los tiempos España se interpretaban
 * como UTC, causando que horas futuras aparecieran como "ya pasadas" y que las
 * sugerencias de siguiente hueco se mostraran 2h antes de lo correcto.
 *
 * Uso: node fix-timezone.js
 */

const fs   = require('fs');
const path = require('path');
const n8nDir     = path.join(__dirname, 'n8n');
const patchesDir = path.join(__dirname, 'n8n', 'patches');

const WF01_PARSEAR    = fs.readFileSync(path.join(patchesDir, 'wf01-parsear.js'),    'utf8');
const WF01_CONFLICTOS = fs.readFileSync(path.join(patchesDir, 'wf01-conflictos.js'), 'utf8');
const WF02_PARSEAR    = fs.readFileSync(path.join(patchesDir, 'wf02-parsear.js'),    'utf8');
const WF04_PARSEAR    = fs.readFileSync(path.join(patchesDir, 'wf04-parsear.js'),    'utf8');
const WF04_ENCONTRAR  = fs.readFileSync(path.join(patchesDir, 'wf04-encontrar.js'),  'utf8');

function patch(file, patches) {
  const wf = JSON.parse(fs.readFileSync(path.join(n8nDir, file), 'utf8'));
  for (const [name, code] of Object.entries(patches)) {
    const node = wf.nodes.find(n => n.name === name);
    if (!node) { console.error('  !! Nodo no encontrado:', name); continue; }
    node.parameters.jsCode = code;
    console.log('  ✔', name);
  }
  fs.writeFileSync(path.join(n8nDir, file), JSON.stringify(wf, null, 2));
}

console.log('WF01...');
patch('01-verificar-disponibilidad.json', {
  'Parsear Argumentos':   WF01_PARSEAR,
  'Verificar Conflictos': WF01_CONFLICTOS,
});

console.log('WF02...');
patch('02-crear-cita.json', {
  'Parsear Argumentos': WF02_PARSEAR,
});

console.log('WF04...');
patch('04-modificar-cita.json', {
  'Parsear Argumentos':       WF04_PARSEAR,
  'Encontrar Cita en Sheets': WF04_ENCONTRAR,
});

console.log('\nDone. Ejecuta: node build-unified.js');
