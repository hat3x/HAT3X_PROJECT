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
    [/blanqueamiento/, 60],
    [/endodoncia/, 60],
    [/implante|cirugia/, 60],
    [/limpieza/, 45],
    [/empaste/, 45],
    [/prostodoncia|protesis|corona|puente/, 45],
    [/periodoncia|encia/, 45],
    [/extracc/, 30],
    [/ortodoncia/, 30],
    [/revis|general|consulta/, 30],
  ];
  for (const [re, min] of TABLA) if (re.test(s)) return min;
  return 30;
}
const duracion = durFor(servicio);

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

const HORARIOS = {
  1: { inicio: 9 * 60 + 30, fin: 19 * 60 },
  2: { inicio: 9 * 60 + 30, fin: 19 * 60 },
  3: { inicio: 9 * 60 + 30, fin: 14 * 60 },
  4: { inicio: 9 * 60 + 30, fin: 19 * 60 },
  5: { inicio: 9 * 60 + 30, fin: 14 * 60 },
  6: { inicio: 9 * 60 + 30, fin: 14 * 60 }
};

const horarioDia = HORARIOS[diaSemana];

if (!horarioDia) {
  return [{ json: {
    error: 'dia_cerrado', disponible: false,
    mensaje: 'Los domingos la clínica está cerrada. Abrimos de lunes a viernes, y algún sábado al mes.'
  }}];
}

const horaReqMin = localInicio.getHours() * 60 + localInicio.getMinutes();
const horaFinMin = localFin.getHours()    * 60 + localFin.getMinutes();

if (horaReqMin < horarioDia.inicio) {
  return [{ json: {
    error: 'fuera_horario', disponible: false,
    mensaje: 'Esa hora es antes de que abramos. Empezamos a atender a las nueve y media.'
  }}];
}

if (horaFinMin > horarioDia.fin) {
  const esMediodia = horarioDia.fin === 14 * 60;
  return [{ json: {
    error: 'fuera_horario', disponible: false,
    mensaje: 'Esa hora no nos da tiempo antes del cierre. Los ' + diasSemana[diaSemana] + ' cerramos a las ' + (esMediodia ? 'dos de la tarde' : 'siete de la tarde') + '.'
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
