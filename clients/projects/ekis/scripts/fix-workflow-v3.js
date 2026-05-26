const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('ekis-final-v2.json', 'utf8'));

// Función para arreglar expresiones con = extra
function fixEquals(obj) {
  if (!obj) return;

  if (typeof obj === 'string') {
    // Cambiar ={{ a {{ (quitar el = extra)
    // Pero mantener ={{ cuando es una expresión válida de n8n
    // El problema es que tenemos ={{ }} cuando debería ser {{ }}
    obj = obj.replace(/=\{\{ \$\(/g, '{{ $(');
    obj = obj.replace(/=\{\{ \$json/g, '{{ $json');
    obj = obj.replace(/=\{\{ \$/g, '{{ $');
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      obj[idx] = fixEquals(item);
    });
  } else if (typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      obj[key] = fixEquals(obj[key]);
    });
  }

  return obj;
}

// Arreglar todo el workflow
fixEquals(wf);

// Verificar nodo Guardar en Reservas_Activas
const sheets = wf.nodes.find(n => n.name === 'Guardar en Reservas_Activas');
console.log('=== EXPRESIONES CORREGIDAS ===');
Object.entries(sheets.parameters.columns.value).forEach(([key, val]) => {
  console.log(key + ': ' + val);
});

// Guardar
fs.writeFileSync('ekis-final-v3.json', JSON.stringify(wf, null, 2));
console.log('\nGuardado: ekis-final-v3.json');
