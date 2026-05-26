const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('ekis-final-v3.json', 'utf8'));

// Corregir Calendar_Event_ID en nodo Guardar en Reservas_Activas
const sheets = wf.nodes.find(n => n.name === 'Guardar en Reservas_Activas');
if (sheets && sheets.parameters.columns.value) {
  sheets.parameters.columns.value.Calendar_Event_ID = '{{ $("Crear Evento Google Calendar").first().json.id }}';
  console.log('Calendar_Event_ID corregido:', sheets.parameters.columns.value.Calendar_Event_ID);
}

// También corregir en otros nodos Sheets si es necesario
wf.nodes.forEach(n => {
  if (n.type === 'n8n-nodes-base.googleSheets' && n.parameters.columns && n.parameters.columns.value) {
    Object.keys(n.parameters.columns.value).forEach(key => {
      const val = n.parameters.columns.value[key];
      if (typeof val === 'string' && val.includes('$json.id') && !val.includes('$(')) {
        n.parameters.columns.value[key] = val.replace('{{ $json.id }}', '{{ $("Crear Evento Google Calendar").first().json.id }}');
        console.log('Corregido en', n.name, key, ':', n.parameters.columns.value[key]);
      }
    });
  }
});

fs.writeFileSync('ekis-corregido.json', JSON.stringify(wf, null, 2));
console.log('\nGuardado: ekis-corregido.json');
