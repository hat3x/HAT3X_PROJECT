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

const HORARIOS = {
  1: { inicio: 9 * 60 + 30, fin: 19 * 60 },
  2: { inicio: 9 * 60 + 30, fin: 19 * 60 },
  3: { inicio: 9 * 60 + 30, fin: 14 * 60 },
  4: { inicio: 9 * 60 + 30, fin: 19 * 60 },
  5: { inicio: 9 * 60 + 30, fin: 14 * 60 },
  6: { inicio: 9 * 60 + 30, fin: 14 * 60 }
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
const horarioDia = HORARIOS[diaSemana];

if (!horarioDia) {
  return [{ json: {
    error: 'dia_cerrado', modificado: false,
    mensaje: 'Los domingos estamos cerrados. ¿Quieres un día entre semana?'
  }}];
}

const horaMin = localNuevaFecha.getHours() * 60 + localNuevaFecha.getMinutes();
if (horaMin < horarioDia.inicio) {
  return [{ json: {
    error: 'fuera_horario', modificado: false,
    mensaje: 'Esa hora es antes de que abramos. Empezamos a las nueve y media.'
  }}];
}
if (horaMin >= horarioDia.fin - 30) {
  const esMediodia = horarioDia.fin === 14 * 60;
  return [{ json: {
    error: 'fuera_horario', modificado: false,
    mensaje: 'Los ' + diasSemana[diaSemana] + ' cerramos a las ' + (esMediodia ? 'dos de la tarde' : 'siete de la tarde') + ' y necesitamos tiempo para la cita.'
  }}];
}

return [{ json: {
  telefono,
  fecha_actual: String(args.fecha_actual || '').trim(),
  hora_actual:  String(args.hora_actual  || '').trim(),
  nueva_fecha, nueva_hora
}}];
