const raw = $('Retell Webhook').first().json.body || $('Retell Webhook').first().json;
const event = raw.event || '';

// Solo registramos en call_analyzed: llega una vez por llamada y trae el análisis.
// Devolver [] evita que el nodo de Sheets se ejecute — nada de filas vacías ni duplicados.
if (event !== 'call_analyzed') return [];

const call     = raw.call || raw;
const analysis = call.call_analysis || raw.call_analysis || {};

// Duración: usar el dato explícito si viene, si no calcularla de las marcas de tiempo
let seg = 0;
if      (call.duration_ms)      seg = Math.round(call.duration_ms / 1000);
else if (call.duration_seconds) seg = Math.round(call.duration_seconds);
else if (call.end_timestamp && call.start_timestamp)
  seg = Math.round((call.end_timestamp - call.start_timestamp) / 1000);

// Fecha de la llamada en hora de España
const inicio = call.start_timestamp ? new Date(call.start_timestamp) : new Date();
const madrid = new Date(inicio.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
const p = n => String(n).padStart(2, '0');
const fecha = madrid.getFullYear() + '-' + p(madrid.getMonth() + 1) + '-' + p(madrid.getDate()) +
              ' ' + p(madrid.getHours()) + ':' + p(madrid.getMinutes()) + ':' + p(madrid.getSeconds());

return [{ json: {
  ID:              call.call_id || '',
  Fecha_llamada:   fecha,
  'Duración_seg':  seg,
  Resumen:         analysis.call_summary   || '',
  Sentimiento:     analysis.user_sentiment || 'Neutral',
  Exitosa:         analysis.call_successful ? 'TRUE' : 'FALSE',
  Call_ID:         call.call_id || '',
}}];
