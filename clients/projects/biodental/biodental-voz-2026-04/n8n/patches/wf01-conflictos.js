const input   = $('Parsear Argumentos').first().json;
const eventos = $('Google Calendar - Consultar Hueco').all();

const HORARIOS = {
  1: { inicio: 9 * 60 + 30, fin: 19 * 60 },
  2: { inicio: 9 * 60 + 30, fin: 19 * 60 },
  3: { inicio: 9 * 60 + 30, fin: 14 * 60 },
  4: { inicio: 9 * 60 + 30, fin: 19 * 60 },
  5: { inicio: 9 * 60 + 30, fin: 14 * 60 },
  6: { inicio: 9 * 60 + 30, fin: 14 * 60 }
};

const newStart = new Date(input.fechaInicio);
const newEnd   = new Date(input.fechaFin);
const ahora    = new Date();
const durMin   = input.duracion || 30;

const diasSemana = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function toMadrid(d) {
  return new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
}

function siguienteHueco(desde, eventos) {
  let candidato = new Date(desde);
  candidato.setSeconds(0, 0);
  const minActual = toMadrid(candidato).getMinutes();
  const resto = minActual % 30;
  if (resto !== 0) candidato = new Date(candidato.getTime() + (30 - resto) * 60000);

  for (let i = 0; i < 336; i++) {
    const local = toMadrid(candidato);
    const dia = local.getDay();
    const h = HORARIOS[dia];
    if (h) {
      const minCand = local.getHours() * 60 + local.getMinutes();
      const minFin  = minCand + durMin;
      if (minCand >= h.inicio && minFin <= h.fin) {
        const candEnd = new Date(candidato.getTime() + durMin * 60000);
        const conflicto = eventos.some(ev => {
          const evStart = new Date(ev.start?.dateTime || ev.start?.date + 'T00:00:00Z');
          const evEnd   = new Date(ev.end?.dateTime   || ev.end?.date   + 'T00:00:00Z');
          return candidato < evEnd && candEnd > evStart;
        });
        if (!conflicto) return candidato;
      }
    }
    candidato = new Date(candidato.getTime() + 30 * 60000);
  }
  return null;
}

function formatSig(sig) {
  const local = toMadrid(sig);
  const sigFecha = local.getFullYear() + '-' + String(local.getMonth()+1).padStart(2,'0') + '-' + String(local.getDate()).padStart(2,'0');
  const sigHora  = String(local.getHours()).padStart(2,'0') + ':' + String(local.getMinutes()).padStart(2,'0');
  const sigTexto = diasSemana[local.getDay()] + ' ' + local.getDate() + ' de ' + meses[local.getMonth()];
  return { sigFecha, sigHora, sigTexto };
}

if (newStart <= ahora) {
  const activos = eventos.map(e => e.json).filter(e => e.status !== 'cancelled' && (e.start?.dateTime || e.start?.date));
  const sig = siguienteHueco(new Date(ahora.getTime() + 30 * 60000), activos);
  if (sig) {
    const { sigFecha, sigHora, sigTexto } = formatSig(sig);
    return [{ json: { disponible: false, siguiente_disponible: { fecha: sigFecha, hora: sigHora },
      mensaje: 'Esa hora ya ha pasado. El siguiente hueco disponible sería el ' + sigTexto + ' a las ' + sigHora }}];
  }
  return [{ json: { disponible: false, mensaje: 'Esa hora ya ha pasado. Dinos qué día y hora le viene bien y lo comprobamos.' }}];
}

const activos = eventos.map(e => e.json).filter(e => e.status !== 'cancelled' && (e.start?.dateTime || e.start?.date));

const hayConflicto = activos.some(ev => {
  const evStart = new Date(ev.start?.dateTime || ev.start?.date + 'T00:00:00Z');
  const evEnd   = new Date(ev.end?.dateTime   || ev.end?.date   + 'T00:00:00Z');
  return newStart < evEnd && newEnd > evStart;
});

if (!hayConflicto) {
  return [{ json: {
    disponible: true, fecha: input.fecha, hora: input.hora, servicio: input.servicio,
    mensaje: 'Hay disponibilidad el ' + input.fechaTexto + ' a las ' + input.hora
  }}];
}

const sig = siguienteHueco(new Date(newStart.getTime() + 30 * 60000), activos);
if (sig) {
  const { sigFecha, sigHora, sigTexto } = formatSig(sig);
  return [{ json: { disponible: false, siguiente_disponible: { fecha: sigFecha, hora: sigHora },
    mensaje: 'No hay disponibilidad a esa hora. El siguiente hueco libre es el ' + sigTexto + ' a las ' + sigHora }}];
}

return [{ json: { disponible: false, mensaje: 'No hay disponibilidad próxima. Dinos qué días y horarios le vienen mejor y lo buscamos.' }}];
