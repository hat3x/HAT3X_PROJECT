// Fecha/hora actuales en Europe/Madrid + mañana y pasado mañana ya calculados,
// para que el modelo no tenga que hacer aritmética de días (fuente de errores).
const ahora  = new Date();
const madrid = new Date(ahora.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));

const dias  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const p2 = n => String(n).padStart(2, '0');

// Ancla a mediodía UTC para sumar días sin problemas de horario/DST.
// Date.UTC normaliza el desbordamiento de día (p. ej. 31 + 1 -> mes siguiente).
function diaInfo(y, m, d) {
  const a = new Date(Date.UTC(y, m, d, 12));
  const yy = a.getUTCFullYear(), mm = a.getUTCMonth(), dd = a.getUTCDate();
  return {
    fecha: yy + '-' + p2(mm + 1) + '-' + p2(dd),
    diaSemana: dias[a.getUTCDay()],
    texto: dias[a.getUTCDay()] + ' ' + dd + ' de ' + meses[mm],
  };
}

const Y = madrid.getFullYear(), M = madrid.getMonth(), D = madrid.getDate();
const hoy = diaInfo(Y, M, D);
const man = diaInfo(Y, M, D + 1);
const pas = diaInfo(Y, M, D + 2);

const hora = p2(madrid.getHours()) + ':' + p2(madrid.getMinutes());

return [{ json: {
  // Campos planos (compatibilidad con lo anterior)
  fecha: hoy.fecha,
  hora,
  diaSemana: hoy.diaSemana,
  fechaTexto: hoy.texto + ' de ' + Y,
  // Fechas relativas ya resueltas — usar directamente, sin sumar días
  hoy:           { fecha: hoy.fecha, diaSemana: hoy.diaSemana, texto: hoy.texto },
  manana:        { fecha: man.fecha, diaSemana: man.diaSemana, texto: man.texto },
  pasado_manana: { fecha: pas.fecha, diaSemana: pas.diaSemana, texto: pas.texto },
  timestamp: ahora.toISOString(),
}}];
