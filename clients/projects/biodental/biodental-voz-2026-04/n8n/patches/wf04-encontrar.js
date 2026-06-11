const { telefono, fecha_actual, hora_actual, nueva_fecha, nueva_hora } = $('Parsear Argumentos').first().json;
const filas = $('Google Sheets - Leer Citas').all();

const fila = filas.find(f => {
  const d = f.json;
  const telMatch   = String(d['Teléfono'] || '').replace(/\D/g, '') === telefono;
  const fechaMatch = String(d['Fecha']    || '').trim() === fecha_actual;
  const activa     = d['Estado'] === 'CONFIRMADA' || d['Estado'] === 'MODIFICADA';
  const horaMatch  = !hora_actual || String(d['Hora'] || '').trim() === hora_actual;
  return telMatch && fechaMatch && activa && horaMatch;
});

if (!fila) {
  return [{ json: {
    encontrado: false, modificado: false,
    mensaje: 'No encontré ninguna cita activa para ese teléfono y fecha.'
  }}];
}

const servicio = fila.json['Servicio'];
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

function spainToUTC(dateStr, timeStr) {
  const asZ = new Date(dateStr + 'T' + timeStr + ':00Z');
  const inMadrid = new Date(asZ.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  return new Date(asZ.getTime() + (asZ - inMadrid));
}

const nuevaFechaInicio = spainToUTC(nueva_fecha, nueva_hora);
const nuevaFechaFin    = new Date(nuevaFechaInicio.getTime() + duracion * 60000);
const localInicio      = new Date(nuevaFechaInicio.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));

const diasSemana = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

return [{ json: {
  encontrado: true,
  calendarEventId: fila.json['Calendar_Event_ID'],
  nombre:   fila.json['Nombre'],
  servicio, telefono, fecha_actual, nueva_fecha, nueva_hora,
  nuevaFechaInicio: nuevaFechaInicio.toISOString(),
  nuevaFechaFin:    nuevaFechaFin.toISOString(),
  fechaTexto: diasSemana[localInicio.getDay()] + ' ' + localInicio.getDate() + ' de ' + meses[localInicio.getMonth()]
}}];
