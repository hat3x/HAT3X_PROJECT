const raw = $('Retell Tool Call').first().json.body || $('Retell Tool Call').first().json;
let args;
if (raw.arguments !== undefined) {
  args = typeof raw.arguments === 'string' ? JSON.parse(raw.arguments) : raw.arguments;
} else if (raw.args !== undefined) {
  args = typeof raw.args === 'string' ? JSON.parse(raw.args) : raw.args;
} else {
  args = raw;
}

const telefonoRaw = String(args.telefono || '').trim();
const telefono = telefonoRaw.replace(/\D/g, '');
if (!/^\d{9}$/.test(telefono)) {
  return [{ json: {
    error: 'telefono_invalido', modificado: false,
    mensaje: 'El teléfono que me has dado no parece correcto. ¿Me puedes repetir los nueve dígitos?'
  }}];
}

const nueva_fecha = String(args.nueva_fecha || '').trim();
const nueva_hora  = String(args.nueva_hora  || '').trim();

// Horario de verano — sesiones por día (minutos desde medianoche)
const SESIONES = {
  1: [{ inicio: 10*60, fin: 14*60 }, { inicio: 17*60, fin: 20*60 }], // Lunes
  2: [{ inicio: 10*60, fin: 14*60 }],                                  // Martes
  3: [{ inicio: 10*60, fin: 20*60 }],                                  // Miércoles (continuo)
  4: [{ inicio: 10*60, fin: 14*60 }],                                  // Jueves
  5: [{ inicio: 10*60, fin: 14*60 }],                                  // Viernes
  // Sábado y domingo: cerrado
};
const diasSemana = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

function spainToUTC(dateStr, timeStr) {
  const asZ = new Date(dateStr + 'T' + timeStr + ':00Z');
  const inMadrid = new Date(asZ.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  return new Date(asZ.getTime() + (asZ - inMadrid));
}

const nuevaFechaUTC   = spainToUTC(nueva_fecha, nueva_hora);
const localNuevaFecha = new Date(nuevaFechaUTC.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
const diaSemana  = localNuevaFecha.getDay();

// Cierres puntuales (festivos, asuntos propios). Formato YYYY-MM-DD, hora Madrid.
const DIAS_CERRADOS = ['2026-08-03'];
if (DIAS_CERRADOS.includes(nueva_fecha)) {
  return [{ json: {
    error: 'dia_cerrado_excepcional', modificado: false,
    mensaje: 'Ese día la clínica está cerrada excepcionalmente. ¿Te viene bien otro día?'
  }}];
}

const sesiones   = SESIONES[diaSemana];

if (!sesiones) {
  const esSabado = diaSemana === 6;
  return [{ json: {
    error: 'dia_cerrado', modificado: false,
    mensaje: esSabado
      ? 'Los sábados no abrimos en verano. ¿Le viene bien algún día entre semana?'
      : 'Los domingos estamos cerrados. ¿Quieres un día entre semana?'
  }}];
}

const horaMin    = localNuevaFecha.getHours() * 60 + localNuevaFecha.getMinutes();
const horaFinMin = horaMin + 30;

const enSesion = sesiones.some(s => horaMin >= s.inicio && horaFinMin <= s.fin);

if (!enSesion) {
  if (horaMin < sesiones[0].inicio) {
    return [{ json: {
      error: 'fuera_horario', modificado: false,
      mensaje: 'Esa hora es antes de que abramos. Empezamos a las diez de la mañana.'
    }}];
  }
  if (sesiones.length > 1 && horaMin >= sesiones[0].fin && horaMin < sesiones[1].inicio) {
    return [{ json: {
      error: 'descanso', modificado: false,
      mensaje: 'De dos a cinco de la tarde estamos cerrados. ¿Le viene bien por la mañana o a partir de las cinco?'
    }}];
  }
  const ultima = sesiones[sesiones.length - 1];
  const cierreTexto = ultima.fin === 14*60 ? 'las dos de la tarde' : ultima.fin === 20*60 ? 'las ocho de la tarde' : 'las ' + Math.floor(ultima.fin/60) + ':' + String(ultima.fin%60).padStart(2,'0');
  return [{ json: {
    error: 'fuera_horario', modificado: false,
    mensaje: 'Los ' + diasSemana[diaSemana] + ' cerramos a ' + cierreTexto + ' y necesitamos tiempo para la cita.'
  }}];
}

return [{ json: {
  telefono,
  fecha_actual: String(args.fecha_actual || '').trim(),
  hora_actual:  String(args.hora_actual  || '').trim(),
  nueva_fecha, nueva_hora
}}];
