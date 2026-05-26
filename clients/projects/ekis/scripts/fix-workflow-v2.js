const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('ekis-fixed.json', 'utf8'));

// Función recursiva para arreglar expresiones en todo el objeto
function fixExpressions(obj, parentNode, keyName) {
  if (!obj) return;

  if (typeof obj === 'string') {
    // Arreglar expresiones de n8n corruptas
    // Patron: ={{ .algo }} -> ={{ $json.algo }}
    obj = obj.replace(/=\{\{ \.([^}]+)\}\}/g, '={{ $json.$1 }}');

    // Patron: {{ .first() }} -> {{ $('NodeName').first() }}
    obj = obj.replace(/\{\{ \.\$('([^']+)')\.first\(\)\.json\.([^}]+)\}\}/g, '={{ $(""$2"").first().json.$3 }}');

    // Patron: {{ .first().json.algo }} (sin $) -> {{ $('Preparar Datos').first().json.algo }}
    if (obj.includes('.first().json')) {
      obj = obj.replace(/\{\{ \.first\(\)\.json\.([^}]+)\}\}/g, '={{ $("Preparar Datos").first().json.$1 }}');
    }

    // Patron: {{ $json.id }} ya está bien, pero por si acaso
    obj = obj.replace(/\{\{ \$\.id \}\}/g, '{{ $json.id }}');
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      obj[idx] = fixExpressions(item, obj, idx);
    });
  } else if (typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      obj[key] = fixExpressions(obj[key], obj, key);
    });
  }

  return obj;
}

// Arreglar todo el workflow
fixExpressions(wf);

// Verificar nodos clave
const calendar = wf.nodes.find(n => n.name === 'Crear Evento Google Calendar');
const sheets = wf.nodes.find(n => n.name === 'Guardar en Reservas_Activas');
const preparar = wf.nodes.find(n => n.name === 'Preparar Datos');

console.log('=== VERIFICACIÓN ===');
console.log('Calendar start:', calendar.parameters.start);
console.log('Calendar end:', calendar.parameters.end);
console.log('Sheets ID_Reserva:', sheets.parameters.columns.value.ID_Reserva);
console.log('Sheets Calendar_Event_ID:', sheets.parameters.columns.value.Calendar_Event_ID);

// Guardar
fs.writeFileSync('ekis-final-v2.json', JSON.stringify(wf, null, 2));
console.log('\nGuardado: ekis-final-v2.json');
