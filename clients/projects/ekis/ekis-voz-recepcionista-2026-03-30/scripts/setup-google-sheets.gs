/**
 * ============================================================
 * Ekis Restaurante — Setup Google Sheets
 * ============================================================
 * Ejecutar UNA SOLA VEZ para crear toda la estructura.
 *
 * Instrucciones:
 * 1. Crear un Google Sheet nuevo y vacío
 * 2. Ir a Extensiones → Apps Script
 * 3. Pegar este código completo
 * 4. Ejecutar primero: testConexion  (para verificar autorización)
 * 5. Ejecutar: crearEstructuraCompleta
 * 6. Copiar el ID de la hoja del URL → guardarlo en .env
 *    (la parte entre /d/ y /edit en la URL)
 * ============================================================
 */

// ── CONFIGURACIÓN ──────────────────────────────────────────
var NOMBRE_RESTAURANTE = 'Restaurante Ekis';
var CAPACIDAD_MAXIMA   = 45;
var TELEFONO_ENCARGADO = '+34XXXXXXXXX';
var EMAIL_RESTAURANTE  = 'info@restauranteekis.com';

// Colores del dashboard
var COLOR_CABECERA    = '#1a1d27';
var COLOR_TEXTO_CLARO = '#FFFFFF';
var COLOR_CONFIRMADA  = '#d9ead3';
var COLOR_ESPERA      = '#fff2cc';
var COLOR_CANCELADA   = '#f4cccc';

// ── TEST RÁPIDO ─────────────────────────────────────────────
// Ejecutar esto PRIMERO para verificar que el script tiene acceso
function testConexion() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('Conexión OK — Spreadsheet: ' + ss.getName());
  Logger.log('Hojas actuales: ' + ss.getSheets().map(function(s) { return s.getName(); }).join(', '));
  Logger.log('Si ves esto, el script funciona. Ahora ejecuta crearEstructuraCompleta.');
}

// ── FUNCIÓN PRINCIPAL ───────────────────────────────────────
function crearEstructuraCompleta() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('Iniciando creación de estructura...');

  try {
    crearTabConfig(ss);
    crearTabReservasActivas(ss);
    crearTabHistorial(ss);
    crearTabListaEspera(ss);
    crearTabLlamadas(ss);

    // Eliminar hoja por defecto si sigue existiendo
    var defecto = null;
    var hojas = ss.getSheets();
    for (var i = 0; i < hojas.length; i++) {
      var nombre = hojas[i].getName();
      if (nombre === 'Hoja 1' || nombre === 'Sheet1' || nombre === 'Hoja1') {
        defecto = hojas[i];
        break;
      }
    }
    if (defecto && ss.getSheets().length > 1) {
      ss.deleteSheet(defecto);
      Logger.log('Hoja por defecto eliminada.');
    }

    // Reordenar pestañas
    var orden = ['Config', 'Reservas_Activas', 'Historial', 'Lista_Espera', 'Llamadas'];
    for (var j = 0; j < orden.length; j++) {
      var hoja = ss.getSheetByName(orden[j]);
      if (hoja) {
        ss.setActiveSheet(hoja);
        ss.moveActiveSheet(j + 1);
      }
    }

    Logger.log('============================================');
    Logger.log('ESTRUCTURA CREADA CORRECTAMENTE');
    Logger.log('Pestanas: Config, Reservas_Activas, Historial, Lista_Espera, Llamadas');
    Logger.log('Proximo paso: copia el ID del URL y ponlo en .env como GOOGLE_SHEETS_SPREADSHEET_ID');
    Logger.log('============================================');

    // Alerta visual (solo si hay interfaz disponible)
    try {
      var ui = SpreadsheetApp.getUi();
      ui.alert(
        'Estructura creada',
        'Todas las pestanas han sido creadas correctamente.\n\n' +
        'Copia el ID del URL de esta hoja y ponlo en .env como GOOGLE_SHEETS_SPREADSHEET_ID.',
        ui.ButtonSet.OK
      );
    } catch (uiErr) {
      Logger.log('(Sin interfaz grafica — resultado visible en el log)');
    }

  } catch (e) {
    Logger.log('ERROR: ' + e.message);
    Logger.log('Stack: ' + e.stack);
    try {
      SpreadsheetApp.getUi().alert('Error', 'Se produjo un error: ' + e.message + '\n\nRevisa el log de ejecucion para mas detalles.', SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (uiErr2) {
      // Sin UI
    }
  }
}

// ── PESTAÑA CONFIG ──────────────────────────────────────────
function crearTabConfig(ss) {
  var sheet = obtenerOCrearHoja(ss, 'Config');
  sheet.clearContents();
  sheet.clearFormats();

  var datos = [
    ['PARAMETRO', 'VALOR'],
    ['nombre_restaurante', NOMBRE_RESTAURANTE],
    ['capacidad_maxima', CAPACIDAD_MAXIMA],
    ['hora_inicio_almuerzo', '13:30'],
    ['hora_fin_almuerzo', '16:00'],
    ['hora_inicio_cena', '20:30'],
    ['hora_fin_cena', '23:59'],
    ['dias_abierto', 'martes,miercoles,jueves,viernes,sabado,domingo'],
    ['dias_cerrado', 'lunes'],
    ['antelacion_grupos_dias', 4],
    ['max_personas_sin_aviso', 10],
    ['email_restaurante', EMAIL_RESTAURANTE],
    ['telefono_encargado', TELEFONO_ENCARGADO],
    ['timezone', 'Europe/Madrid']
  ];

  sheet.getRange(1, 1, datos.length, 2).setValues(datos);

  var cabecera = sheet.getRange(1, 1, 1, 2);
  cabecera.setBackground(COLOR_CABECERA)
    .setFontColor(COLOR_TEXTO_CLARO)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 300);
  sheet.getRange(2, 1, datos.length - 1, 1).setFontWeight('bold');
  sheet.setFrozenRows(1);

  Logger.log('Config creada OK');
}

// ── PESTAÑA RESERVAS ACTIVAS ────────────────────────────────
function crearTabReservasActivas(ss) {
  var sheet = obtenerOCrearHoja(ss, 'Reservas_Activas');
  sheet.clearContents();
  sheet.clearFormats();

  var cabeceras = [
    'ID_Reserva', 'Fecha', 'Franja', 'Nombre', 'Telefono',
    'Personas', 'Estado', 'Notas', 'Fecha_Creacion', 'Fecha_Modificacion',
    'Call_ID', 'Origen', 'Recordatorio_Enviado', 'Calendar_Event_ID'
  ];

  var rangoCabecera = sheet.getRange(1, 1, 1, cabeceras.length);
  rangoCabecera.setValues([cabeceras]);
  rangoCabecera.setBackground(COLOR_CABECERA)
    .setFontColor(COLOR_TEXTO_CLARO)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  var anchos = [160, 100, 90, 160, 140, 80, 120, 200, 160, 160, 140, 90, 160, 200];
  for (var i = 0; i < anchos.length; i++) {
    sheet.setColumnWidth(i + 1, anchos[i]);
  }
  sheet.setFrozenRows(1);

  // Formato condicional por estado
  var reglas = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('confirmada')
      .setBackground(COLOR_CONFIRMADA)
      .setRanges([sheet.getRange('A2:N1000')])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('en_espera')
      .setBackground(COLOR_ESPERA)
      .setRanges([sheet.getRange('A2:N1000')])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('cancelada')
      .setBackground(COLOR_CANCELADA)
      .setRanges([sheet.getRange('A2:N1000')])
      .build()
  ];
  sheet.setConditionalFormatRules(reglas);

  Logger.log('Reservas_Activas creada OK');
}

// ── PESTAÑA HISTORIAL ───────────────────────────────────────
function crearTabHistorial(ss) {
  var sheet = obtenerOCrearHoja(ss, 'Historial');
  sheet.clearContents();
  sheet.clearFormats();

  var cabeceras = [
    'ID_Reserva', 'Fecha', 'Franja', 'Nombre', 'Telefono',
    'Personas', 'Estado', 'Notas', 'Fecha_Creacion', 'Fecha_Modificacion',
    'Call_ID', 'Origen', 'Recordatorio_Enviado', 'Calendar_Event_ID',
    'Estado_Final', 'Motivo_Cancelacion', 'Fecha_Cancelacion'
  ];

  sheet.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras])
    .setBackground('#37474f')
    .setFontColor(COLOR_TEXTO_CLARO)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  var anchos = [160, 100, 90, 160, 140, 80, 120, 200, 160, 160, 140, 90, 160, 200, 140, 180, 160];
  for (var i = 0; i < anchos.length; i++) {
    sheet.setColumnWidth(i + 1, anchos[i]);
  }
  sheet.setFrozenRows(1);

  Logger.log('Historial creado OK');
}

// ── PESTAÑA LISTA DE ESPERA ─────────────────────────────────
function crearTabListaEspera(ss) {
  var sheet = obtenerOCrearHoja(ss, 'Lista_Espera');
  sheet.clearContents();
  sheet.clearFormats();

  var cabeceras = [
    'ID', 'Fecha_Solicitud', 'Fecha_Deseada', 'Franja',
    'Nombre', 'Telefono', 'Personas', 'Estado', 'Notas', 'Notificado_El'
  ];

  sheet.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras])
    .setBackground('#4a148c')
    .setFontColor(COLOR_TEXTO_CLARO)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  var anchos = [140, 140, 120, 90, 160, 140, 80, 110, 200, 160];
  for (var i = 0; i < anchos.length; i++) {
    sheet.setColumnWidth(i + 1, anchos[i]);
  }
  sheet.setFrozenRows(1);

  Logger.log('Lista_Espera creada OK');
}

// ── PESTAÑA LLAMADAS ────────────────────────────────────────
function crearTabLlamadas(ss) {
  var sheet = obtenerOCrearHoja(ss, 'Llamadas');
  sheet.clearContents();
  sheet.clearFormats();

  var cabeceras = [
    'Call_ID', 'Fecha', 'Telefono', 'Duracion_Segundos',
    'Accion_Principal', 'Resultado', 'Sentimiento',
    'Resumen', 'Transferido_A_Humano', 'ID_Reserva_Asociada'
  ];

  sheet.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras])
    .setBackground('#1a237e')
    .setFontColor(COLOR_TEXTO_CLARO)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  var anchos = [160, 160, 140, 140, 140, 100, 110, 300, 160, 160];
  for (var i = 0; i < anchos.length; i++) {
    sheet.setColumnWidth(i + 1, anchos[i]);
  }
  sheet.setFrozenRows(1);

  Logger.log('Llamadas creada OK');
}

// ── UTILIDAD ────────────────────────────────────────────────
function obtenerOCrearHoja(ss, nombre) {
  return ss.getSheetByName(nombre) || ss.insertSheet(nombre);
}

// ── TRIGGER DIARIO: mover reservas pasadas al historial ─────
/**
 * Configurar el trigger: Apps Script → Triggers → Add Trigger
 * Función: moverReservasPasadas | Evento: Time-driven | Daily | entre 2:00-3:00am
 */
function moverReservasPasadas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var activas   = ss.getSheetByName('Reservas_Activas');
  var historial = ss.getSheetByName('Historial');

  if (!activas || !historial) {
    Logger.log('No se encontraron las hojas Reservas_Activas o Historial');
    return;
  }

  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  var datos = activas.getDataRange().getValues();
  if (datos.length <= 1) return;

  var cabecera    = datos[0];
  var idxFecha    = cabecera.indexOf('Fecha');
  var idxEstado   = cabecera.indexOf('Estado');

  var paraHistorial = [];
  var paraQuedar    = [datos[0]];

  for (var i = 1; i < datos.length; i++) {
    var fila = datos[i];
    var fechaRaw = fila[idxFecha];
    if (!fechaRaw) { paraQuedar.push(fila); continue; }

    var fechaReserva = new Date(fechaRaw);
    fechaReserva.setHours(0, 0, 0, 0);

    var estado = String(fila[idxEstado] || '').toLowerCase();

    if (fechaReserva < hoy || estado === 'cancelada') {
      var estado_final = estado === 'cancelada' ? 'cancelada_cliente' : 'completada';
      var filaHistorial = fila.concat([estado_final, '', estado === 'cancelada' ? fila[cabecera.indexOf('Fecha_Modificacion')] : new Date()]);
      paraHistorial.push(filaHistorial);
    } else {
      paraQuedar.push(fila);
    }
  }

  if (paraHistorial.length > 0) {
    var ultimaFila = historial.getLastRow() + 1;
    historial.getRange(ultimaFila, 1, paraHistorial.length, paraHistorial[0].length)
      .setValues(paraHistorial);
  }

  activas.clearContents();
  activas.getRange(1, 1, paraQuedar.length, paraQuedar[0].length)
    .setValues(paraQuedar);

  Logger.log('Movidas ' + paraHistorial.length + ' reservas al historial.');
}
