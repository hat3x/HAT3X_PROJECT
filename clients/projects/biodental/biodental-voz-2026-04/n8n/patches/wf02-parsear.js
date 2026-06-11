const raw = $('Retell Tool Call').first().json.body || $('Retell Tool Call').first().json;
let body;
if (raw.arguments !== undefined) {
  body = typeof raw.arguments === 'string' ? JSON.parse(raw.arguments) : raw.arguments;
} else if (raw.args !== undefined) {
  body = typeof raw.args === 'string' ? JSON.parse(raw.args) : raw.args;
} else {
  body = raw;
}

const nombre = String(body.nombre || '').trim();
const telefonoRaw = String(body.telefono || '').trim();
const telefono = telefonoRaw.replace(/\D/g, ''); // normalizar: solo dígitos
const servicio = String(body.servicio || '').trim();
const fecha = String(body.fecha || '').trim();
const hora = String(body.hora || '').trim();
const notas = String(body.notas || '').trim();

// Validar teléfono: exactamente 9 dígitos
if (!/^\d{9}$/.test(telefono)) {
  return [{ json: {
    error: 'telefono_invalido',
    confirmado: false,
    mensaje: 'El teléfono que me has dado no parece correcto. ¿Me puedes repetir los nueve dígitos?'
  }}];
}

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
const fechaFin = new Date(fechaInicio.getTime() + duracion * 60000);

const diasSemana = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const localInicio = new Date(fechaInicio.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
const diaSemana = diasSemana[localInicio.getDay()];
const diaMes = localInicio.getDate();
const mes = meses[localInicio.getMonth()];

const descripcion = 'Paciente: ' + nombre + '\nTeléfono: ' + telefono + '\nServicio: ' + servicio + '\nDuración: ' + duracion + ' min' + (notas ? '\nNotas: ' + notas : '') + '\nCreado por: Recepcionista IA Sara';

return [{ json: {
  nombre, telefono, servicio, fecha, hora, notas, duracion,
  fechaInicio: fechaInicio.toISOString(),
  fechaFin: fechaFin.toISOString(),
  tituloEvento: nombre + ' - ' + servicio,
  descripcion, diaSemana, diaMes, mes
}}];
