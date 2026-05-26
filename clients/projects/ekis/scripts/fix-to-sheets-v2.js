const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('ekis-corregido.json', 'utf8'));

// Convertir todos los nodos Google Sheets de v3 a v2
let actualizados = 0;

wf.nodes.forEach(node => {
  if (node.type === 'n8n-nodes-base.googleSheets') {
    console.log('Convirtiendo:', node.name, 'v3 → v2');
    actualizados++;

    node.typeVersion = 2;

    // v2 usa estructura diferente para columns
    if (node.parameters.operation === 'append' || node.parameters.operation === 'update') {
      if (node.parameters.columns && node.parameters.columns.mappingMode === 'defineBelow') {
        // v2: columns es un objeto simple, no tiene mappingMode
        const columnsValue = node.parameters.columns.value;

        // Para update, necesitamos matchingColumns
        if (node.parameters.operation === 'update') {
          node.parameters.columns = {
            ...columnsValue
          };
          // Añadir matchingColumns si no existe
          if (!node.parameters.matchingColumns) {
            node.parameters.matchingColumns = ['ID_Reserva'];
          }
        } else {
          // Para append, columns es el objeto directo
          node.parameters.columns = columnsValue;
        }

        // Quitar documentId si existe, v2 usa sheetId
        if (node.parameters.documentId) {
          node.parameters.sheetId = node.parameters.documentId;
          delete node.parameters.documentId;
        }
      }
    } else if (node.parameters.operation === 'read') {
      // v2 para read usa range en lugar de sheetName
      if (node.parameters.sheetName) {
        node.parameters.range = node.parameters.sheetName + '!A:Z';
        delete node.parameters.sheetName;
      }
      if (node.parameters.documentId) {
        node.parameters.sheetId = node.parameters.documentId;
        delete node.parameters.documentId;
      }
    }
  }
});

console.log('\\nNodos actualizados:', actualizados);

// Verificar nodo Guardar en Reservas_Activas
const guardar = wf.nodes.find(n => n.name === 'Guardar en Reservas_Activas');
console.log('\\n=== GUARDAR EN RESERVAS_ACTIVAS (v2) ===');
console.log('typeVersion:', guardar.typeVersion);
console.log('operation:', guardar.parameters.operation);
console.log('sheetId:', guardar.parameters.sheetId);
console.log('columns:', JSON.stringify(guardar.parameters.columns, null, 2));

fs.writeFileSync('ekis-v2.json', JSON.stringify(wf, null, 2));
console.log('\\nGuardado: ekis-v2.json');
