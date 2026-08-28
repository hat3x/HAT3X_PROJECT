const raw = $('Retell Tool Call').first().json.body || $('Retell Tool Call').first().json;
let args;
if (raw.arguments !== undefined) {
  args = typeof raw.arguments === 'string' ? JSON.parse(raw.arguments) : raw.arguments;
} else if (raw.args !== undefined) {
  args = typeof raw.args === 'string' ? JSON.parse(raw.args) : raw.args;
} else {
  args = raw;
}

const servicio = String(args.servicio || '').trim();
const fecha    = String(args.fecha    || '').trim();
const hora     = String(args.hora     || '').trim();

// Duración según servicio — tolera nombres con/sin acentos y variantes
function durFor(servicio) {
  const s = String(servicio || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const TABLA = [
    [/blanqueamiento|estetica|carilla|diseno.*sonrisa/, 60],
    [/endodoncia/, 60],
    [/implante|cirugia/, 60],
    [/sedacion/, 60],
    [/domicilio/, 60],
    [/limpieza/, 45],
    [/empaste/, 45],
    [/prostodoncia|protesis|corona|puente/, 45],
    [/periodoncia|encia/, 45],
    [/extracc/, 30],
    [/ortodoncia|alineador|bracket/, 30],
    [/odontopediatria|nino|infantil/, 30],
    [/diagnostic|escaneo|radiografia/, 30],
    [/revis|general|consulta/, 30],
  ];
  for (const [re, min] of TABLA) if (re.test(s)) return min;
  return 30;
}
const duracion = durFor(servicio);

// Endodoncia: solo la realiza el especialista (Nicolás), que viene los martes por la mañana
const esEndodoncia = /endodoncia/.test(String(servicio).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));

// Convierte hora local España a UTC correcto (servidor n8n es UTC)
function spainToUTC(dateStr, timeStr) {
  const asZ = new Date(dateStr + 'T' + timeStr + ':00Z');
  const inMadrid = new Date(asZ.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  return new Date(asZ.getTime() + (asZ - inMadrid));
}

const fechaInicio = spainToUTC(fecha, hora);
const fechaFin    = new Date(fechaInicio.getTime() + duracion * 60000);

const diasSemana = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// Usar hora local Madrid para validación de horario comercial
const localInicio = new Date(fechaInicio.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
const localFin    = new Date(fechaFin.toLocaleString('en-US',    { timeZone: 'Europe/Madrid' }));
const diaSemana   = localInicio.getDay();

// Horario de verano — sesiones por día (minutos desde medianoche)
const SESIONES = {
  1: [{ inicio: 10*60, fin: 14*60 }, { inicio: 17*60, fin: 20*60 }], // Lunes
  2: [{ inicio: 10*60, fin: 14*60 }],                                  // Martes
  3: [{ inicio: 10*60, fin: 20*60 }],                                  // Miércoles (continuo)
  4: [{ inicio: 10*60, fin: 14*60 }],                                  // Jueves
  5: [{ inicio: 10*60, fin: 14*60 }],                                  // Viernes
  // Sábado y domingo: cerrado
};

// Cierres puntuales (festivos, asuntos propios). Formato YYYY-MM-DD, hora Madrid.
const DIAS_CERRADOS = ['2026-08-03'];
if (DIAS_CERRADOS.includes(fecha)) {
  return [{ json: {
    error: 'dia_cerrado_excepcional', disponible: false,
    mensaje: 'Ese día la clínica está cerrada excepcionalmente. ¿Te viene bien otro día y lo miramos?'
  }}];
}

const sesiones = SESIONES[diaSemana];

if (!sesiones) {
  const esSabado = diaSemana === 6;
  return [{ json: {
    error: 'dia_cerrado', disponible: false,
    mensaje: esSabado
      ? 'Los sábados no abrimos en verano. ¿Le viene bien algún día entre semana?'
      : 'Los domingos la clínica está cerrada. Abrimos de lunes a viernes.'
  }}];
}

const horaReqMin = localInicio.getHours() * 60 + localInicio.getMinutes();
const horaFinMin = localFin.getHours()    * 60 + localFin.getMinutes();

// Verificar que la cita entera cabe en alguna sesión
const enSesion = sesiones.some(s => horaReqMin >= s.inicio && horaFinMin <= s.fin);

if (!enSesion) {
  if (horaReqMin < sesiones[0].inicio) {
    return [{ json: {
      error: 'fuera_horario', disponible: false,
      mensaje: 'Esa hora es antes de que abramos. Empezamos a las diez de la mañana.'
    }}];
  }
  // Entre sesiones (descanso de mediodía — solo aplica en días con horario partido)
  if (sesiones.length > 1 && horaReqMin >= sesiones[0].fin && horaReqMin < sesiones[1].inicio) {
    return [{ json: {
      error: 'descanso', disponible: false,
      mensaje: 'De dos a cinco de la tarde estamos cerrados. ¿Le viene bien a primera hora de la mañana o a partir de las cinco?'
    }}];
  }
  const ultima = sesiones[sesiones.length - 1];
  const cierreTexto = ultima.fin === 14*60 ? 'las dos de la tarde' : ultima.fin === 20*60 ? 'las ocho de la tarde' : 'las ' + Math.floor(ultima.fin/60) + ':' + String(ultima.fin%60).padStart(2,'0');
  return [{ json: {
    error: 'fuera_horario', disponible: false,
    mensaje: 'Esa hora no nos da tiempo antes del cierre. Los ' + diasSemana[diaSemana] + ' cerramos a ' + cierreTexto + '.'
  }}];
}

// Endodoncia solo los martes (día 2), cuando está el especialista Nicolás.
// Otros días: derivar a la clínica para confirmar según agenda del especialista.
if (esEndodoncia && diaSemana !== 2) {
  return [{ json: {
    error: 'endodoncia_solo_martes', disponible: false,
    mensaje: 'Las endodoncias las hace nuestro especialista, que viene los martes por la mañana. ¿Te viene bien un martes? Si necesitas otro día, te pongo en contacto con la clínica para confirmarlo.'
  }}];
}

// Ventana amplia para la consulta de calendario: desde el inicio del día pedido
// hasta 8 días después, para que la búsqueda de siguiente hueco vea todas las citas
const ventanaInicio = spainToUTC(fecha, '00:00');
const ventanaFin    = new Date(ventanaInicio.getTime() + 8 * 24 * 60 * 60000);

return [{ json: {
  servicio, fecha, hora, duracion,
  fechaInicio: fechaInicio.toISOString(),
  fechaFin:    fechaFin.toISOString(),
  ventanaInicio: ventanaInicio.toISOString(),
  ventanaFin:    ventanaFin.toISOString(),
  fechaTexto: diasSemana[localInicio.getDay()] + ' ' + localInicio.getDate() + ' de ' + meses[localInicio.getMonth()]
}}];
