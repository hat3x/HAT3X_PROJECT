const fs = require('fs');
const raw = fs.readFileSync('./wf_now.json', 'utf8');
const wf = JSON.parse(raw);

// Get exact node name and rename to safe ASCII
const modNode = wf.nodes.find(n => n.name.includes('Preparar Modif'));
const oldName = modNode.name;
const safeName = 'Buscar y Preparar Modificacion';

console.log('Old name codepoints:', [...oldName].map(c=>c.codePointAt(0).toString(16)));

modNode.name = safeName;

// Update connections
const conns = wf.connections;
if (conns[oldName]) { conns[safeName] = conns[oldName]; delete conns[oldName]; }
Object.keys(conns).forEach(from => {
  if (conns[from].main) conns[from].main.forEach(outs => (outs||[]).forEach(c => {
    if (c.node === oldName) c.node = safeName;
    if (c.index === undefined) c.index = 0;
  }));
});

// Update expressions in other nodes using string replacement
wf.nodes.forEach(n => {
  let s = JSON.stringify(n.parameters);
  // Find and replace any reference to the old node name in expressions
  // Use a simple indexOf check first
  if (s.includes('Buscar y Preparar Modif')) {
    // Replace the corrupt name with safe name
    // The old name has the special char between 'Modificaci' and 'n'
    s = s.replace(/Buscar y Preparar Modificaci.n/g, safeName);
    n.parameters = JSON.parse(s);
    console.log('Updated expressions in node:', n.name);
  }
});

// Fix Actualizar en Sheets
const act = wf.nodes.find(n => n.name === 'Actualizar en Sheets');
act.parameters.operation = 'update';
act.parameters.columns.value = {
  'ID_Reserva': "={{ $('" + safeName + "').first().json.idReserva }}",
  'Fecha': "={{ $('" + safeName + "').first().json.fechaFinalFormateada }}",
  'Franja': "={{ $('" + safeName + "').first().json.franjaFinal }}",
  'Personas': "={{ $('" + safeName + "').first().json.personasFinal }}",
  'Estado': 'confirmada',
  'Fecha_Modificacion': "={{ $('" + safeName + "').first().json.ahora }}"
};
act.parameters.columns.matchingColumns = ['ID_Reserva'];
console.log('Fixed Actualizar en Sheets, sample:', act.parameters.columns.value['ID_Reserva']);

const payload = { name: wf.name, nodes: wf.nodes, connections: conns, settings: { executionOrder: 'v1' }, staticData: wf.staticData || null };
fs.writeFileSync('./wf_master7.json', JSON.stringify(payload), 'utf8');
console.log('Saved wf_master7.json');
