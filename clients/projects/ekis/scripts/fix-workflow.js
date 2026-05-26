const fs = require('fs');

// Leer workflow
const wf = JSON.parse(fs.readFileSync('ekis-final.json', 'utf8'));

// Expresión para encontrar referencias corruptas
const corruptPattern1 = /\{\{ \.first\(\)\.json\./g;
const corruptPattern2 = /\{\{ \$\.id \}\}/g;

// Arreglar todos los nodos
wf.nodes.forEach(node => {
  // Arreglar columnas en Sheets
  if (node.parameters && node.parameters.columns && node.parameters.columns.value) {
    const cols = node.parameters.columns.value;
    Object.keys(cols).forEach(key => {
      if (typeof cols[key] === 'string') {
        // Reemplazar referencias corruptas
        cols[key] = cols[key].replace(corruptPattern1, '{{ $("Preparar Datos").first().json.');
        cols[key] = cols[key].replace(/\{\{ \.id \}\}/g, '{{ $json.id }}');
      }
    });
  }

  // Arreglar additionalFields en Calendar
  if (node.parameters && node.parameters.additionalFields) {
    const fields = node.parameters.additionalFields;
    Object.keys(fields).forEach(key => {
      if (typeof fields[key] === 'string') {
        fields[key] = fields[key].replace(/\{\{ \.json\./g, '{{ $json.');
      }
    });
  }

  // Arreglar start/end en Calendar
  if (node.parameters && node.parameters.start) {
    node.parameters.start = node.parameters.start.replace(/\{\{ \.json\./g, '{{ $json.');
  }
  if (node.parameters && node.parameters.end) {
    node.parameters.end = node.parameters.end.replace(/\{\{ \.json\./g, '{{ $json.');
  }

  // Arreglar valores en nodos Set
  if (node.parameters && node.parameters.values) {
    const values = node.parameters.values;
    if (values.string) {
      values.string.forEach(s => {
        if (s.value) s.value = s.value.replace(/\{\{ \.first\(\)\.json\./g, '{{ $("Preparar Datos").first().json.');
      });
    }
  }

  // Arreglar responseBody en respondToWebhook
  if (node.parameters && node.parameters.responseBody) {
    node.parameters.responseBody = node.parameters.responseBody.replace(/\{\{ \.json\./g, '{{ $json.');
  }
});

// Verificar nodo Guardar en Reservas_Activas
const guardar = wf.nodes.find(n => n.name === 'Guardar en Reservas_Activas');
console.log('=== Guardar en Reservas_Activas ===');
console.log(JSON.stringify(guardar.parameters.columns.value, null, 2));

// Guardar workflow arreglado
fs.writeFileSync('ekis-fixed.json', JSON.stringify(wf, null, 2));
console.log('\nGuardado: ekis-fixed.json');
