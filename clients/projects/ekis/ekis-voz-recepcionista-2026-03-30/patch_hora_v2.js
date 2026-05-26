const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('C:/Users/josem/Desktop/HAT3X/CLAUDE/HAT3X/proyectos/ekis-voz-recepcionista-2026-03-30/wf_live_v2.json'));

// ── 1. Preparar Datos ─────────────────────────────────────────────────────────
const prepDatos = wf.nodes.find(n => n.name === 'Preparar Datos');
prepDatos.parameters.jsCode = [
  "try {",
  "  const raw = $input.first()?.json?.body || $input.first()?.json || {};",
  "  let body;",
  "  if (raw.args !== undefined) {",
  "    body = raw.args;",
  "  } else if (raw.arguments !== undefined) {",
  "    body = typeof raw.arguments === 'string' ? JSON.parse(raw.arguments) : raw.arguments;",
  "  } else {",
  "    body = raw;",
  "  }",
  "",
  "  const nombre   = String(body.nombre    || '').trim();",
  "  const telefono = String(body.telefono  || '').trim();",
  "  const personas = parseInt(body.personas) || 0;",
  "  const fecha    = String(body.fecha     || '').trim();",
  "  const franja   = String(body.franja    || '').trim();",
  "  const notas    = String(body.notas     || '').trim();",
  "  const horaRaw  = String(body.hora      || '').trim();",
  "",
  "  if (!nombre || !telefono || !personas || !fecha || !franja) {",
  "    return [{ json: { error: true, mensaje: 'Faltan datos para crear la reserva.' } }];",
  "  }",
  "",
  "  const horaDefecto = franja === 'almuerzo' ? '13:30' : '20:30';",
  "  const horaUso = /^[0-9]{2}:[0-9]{2}$/.test(horaRaw) ? horaRaw : horaDefecto;",
  "",
  "  let fechaFin = fecha;",
  "  const horaFinStr = franja === 'almuerzo' ? '16:00:00' : '00:00:00';",
  "  if (franja === 'cena') {",
  "    const d = new Date(fecha + 'T00:00:00');",
  "    d.setDate(d.getDate() + 1);",
  "    fechaFin = d.toISOString().substring(0, 10);",
  "  }",
  "",
  "  const fechaHoraInicio = fecha    + 'T' + horaUso + ':00';",
  "  const fechaHoraFin    = fechaFin + 'T' + horaFinStr;",
  "",
  "  const fechaCompacta = fecha.replace(/-/g, '');",
  "  const inicialFranja = franja === 'almuerzo' ? 'A' : 'C';",
  "  const aleatorio     = Math.random().toString(36).toUpperCase().substring(2, 6);",
  "  const idReserva     = fechaCompacta + inicialFranja + '-' + aleatorio;",
  "",
  "  const partes = fecha.split('-');",
  "  const fechaFormateada = partes[2] + '/' + partes[1] + '/' + partes[0];",
  "",
  "  const apellido     = nombre.split(' ').pop();",
  "  const tituloEvento = 'Ekis - ' + apellido + ' (' + personas + ' pers.) - ' + franja;",
  "",
  "  const nl = String.fromCharCode(10);",
  "  const lineas = [",
  "    'Reserva ID: ' + idReserva,",
  "    'Nombre: '     + nombre,",
  "    'Telefono: '   + telefono,",
  "    'Personas: '   + personas,",
  "    'Franja: '     + franja,",
  "    'Hora: '       + horaUso",
  "  ];",
  "  if (notas) lineas.push('Notas: ' + notas);",
  "  const descripcion = lineas.join(nl);",
  "",
  "  const diasSemana  = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];",
  "  const diaSemana   = diasSemana[new Date(fecha).getDay()] || 'desconocido';",
  "  const franjaTexto = franja === 'almuerzo' ? 'a mediodia' : 'por la noche';",
  "  const mensajeConfirmacion = 'Reserva confirmada a nombre de ' + apellido",
  "    + ', para ' + personas + (personas === 1 ? ' persona' : ' personas')",
  "    + ', el ' + diaSemana + ' ' + franjaTexto + ' a las ' + horaUso + '. Te esperamos.';",
  "",
  "  const ahora = new Date().toISOString().replace('T', ' ').substring(0, 19);",
  "",
  "  return [{ json: {",
  "    error: false, idReserva, nombre, apellido, telefono, personas,",
  "    fecha, franja, hora: horaUso, notas,",
  "    fechaFormateada, fechaHoraInicio, fechaHoraFin,",
  "    tituloEvento, descripcion, mensajeConfirmacion, ahora",
  "  }}];",
  "} catch (e) {",
  "  return [{ json: { error: true, mensaje: 'Error en Preparar Datos: ' + e.message } }];",
  "}"
].join('\n');

// ── 2. Buscar y Preparar Modificacion — add nueva_hora ───────────────────────
const modif = wf.nodes.find(n => n.name === 'Buscar y Preparar Modificacion');
let codeModif = modif.parameters.jsCode;

// Add nueva_hora extraction after nuevasPersonas
codeModif = codeModif.replace(
  'const nuevasPersonas = body.nuevas_personas ? parseInt(body.nuevas_personas) : null;',
  "const nuevasPersonas = body.nuevas_personas ? parseInt(body.nuevas_personas) : null;\n  const nuevaHora = body.nueva_hora ? String(body.nueva_hora).trim() : null;"
);

// Replace the hardcoded hora block — use regex to find and replace
const oldBlock = /\/\/ Fechas-hora para Calendar\nconst horaInicio = franjaFinal === 'almuerzo' \? '13:30:00' : '20:30:00';\nconst horaFin    = franjaFinal === 'almuerzo' \? '16:00:00' : '23:59:00';\nconst fechaHoraInicio = `\$\{fechaFinal\}T\$\{horaInicio\}`;\nconst fechaHoraFin    = `\$\{fechaFinal\}T\$\{horaFin\}`;/;

const newBlock = [
  "// Fechas-hora para Calendar",
  "const horaDefecto = franjaFinal === 'almuerzo' ? '13:30' : '20:30';",
  "const horaUso     = (nuevaHora && /^[0-9]{2}:[0-9]{2}$/.test(nuevaHora)) ? nuevaHora : horaDefecto;",
  "const horaFinStr  = franjaFinal === 'almuerzo' ? '16:00:00' : '00:00:00';",
  "let fechaFinCal = fechaFinal;",
  "if (franjaFinal === 'cena') {",
  "  const dCal = new Date(fechaFinal + 'T00:00:00');",
  "  dCal.setDate(dCal.getDate() + 1);",
  "  fechaFinCal = dCal.toISOString().substring(0, 10);",
  "}",
  "const fechaHoraInicio = fechaFinal  + 'T' + horaUso + ':00';",
  "const fechaHoraFin    = fechaFinCal + 'T' + horaFinStr;"
].join('\n');

codeModif = codeModif.replace(oldBlock, newBlock);

// Verify the replacement worked
if (codeModif.includes('horaUso')) {
  console.log('Modificacion hora replacement: OK');
} else {
  // fallback: just inject after 'const personasFinal' line
  console.log('Regex replacement failed, trying fallback...');
  codeModif = codeModif.replace(
    "const horaInicio = franjaFinal === 'almuerzo' ? '13:30:00' : '20:30:00';\nconst horaFin    = franjaFinal === 'almuerzo' ? '16:00:00' : '23:59:00';\nconst fechaHoraInicio = `${fechaFinal}T${horaInicio}`;\nconst fechaHoraFin    = `${fechaFinal}T${horaFin}`;",
    newBlock
  );
  console.log('Fallback result has horaUso:', codeModif.includes('horaUso'));
}

modif.parameters.jsCode = codeModif;

fs.writeFileSync('C:/Users/josem/Desktop/HAT3X/CLAUDE/HAT3X/proyectos/ekis-voz-recepcionista-2026-03-30/wf_hora_fix.json', JSON.stringify(wf, null, 2));
console.log('Done — wf_hora_fix.json saved');
