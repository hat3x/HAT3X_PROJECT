const fs = require('fs');
const data = JSON.parse(fs.readFileSync('C:/Users/josem/Desktop/HAT3X/CLAUDE/HAT3X/wf_QTEkPUTUb4lLI6Tm.json', 'utf8'));
const nodes = data.nodes || [];

// ---- FIX 1: Preparar Datos (crear-reserva) ----
// Comes directly from webhook Retell Tool Call1 -> use $input
const prepDatos = nodes.find(n => n.name === 'Preparar Datos');
const oldPrepCode = prepDatos.parameters.jsCode;

// The old header uses $('Retell Tool Call') with indented let body
const oldPrepHeader = "const raw = $('Retell Tool Call').first().json.body || $('Retell Tool Call').first().json;\n  let body;\n  if (raw.arguments !== undefined) {\n    body = typeof raw.arguments === 'string' ? JSON.parse(raw.arguments) : raw.arguments;\n  } else {\n    body = raw;\n  }";

const newPrepHeader = "const raw = $input.first().json.body || $input.first().json;\nlet body;\nif (raw.arguments !== undefined) {\n  body = typeof raw.arguments === 'string' ? JSON.parse(raw.arguments) : raw.arguments;\n} else {\n  body = raw;\n}";

prepDatos.parameters.jsCode = oldPrepCode.replace(oldPrepHeader, newPrepHeader);

if (prepDatos.parameters.jsCode === oldPrepCode) {
  console.log('ERROR: Preparar Datos replacement did not match');
  console.log('Looking for:', JSON.stringify(oldPrepHeader.substring(0, 80)));
  console.log('Found in code:', JSON.stringify(oldPrepCode.substring(0, 80)));
} else {
  console.log('OK: Preparar Datos fixed (now uses $input)');
}

// ---- FIX 2: Buscar y Preparar Modificacion -> $('Retell Tool Call2') ----
const buscarMod = nodes.find(n => n.name === 'Buscar y Preparar Modificación');
const oldModCode = buscarMod.parameters.jsCode;

const oldModHeader = "const raw = $('Retell Tool Call').first().json.body || $('Retell Tool Call').first().json;\n  let body;\n  if (raw.arguments !== undefined) {\n    body = typeof raw.arguments === 'string' ? JSON.parse(raw.arguments) : raw.arguments;\n  } else {\n    body = raw;\n  }";

const newModHeader = "const webhookRaw = $('Retell Tool Call2').first().json.body || $('Retell Tool Call2').first().json;\nlet body;\nif (webhookRaw.arguments !== undefined) {\n  body = typeof webhookRaw.arguments === 'string' ? JSON.parse(webhookRaw.arguments) : webhookRaw.arguments;\n} else {\n  body = webhookRaw;\n}";

buscarMod.parameters.jsCode = oldModCode.replace(oldModHeader, newModHeader);

if (buscarMod.parameters.jsCode === oldModCode) {
  console.log('ERROR: Buscar y Preparar Modificacion replacement did not match');
  console.log('Code starts with:', JSON.stringify(oldModCode.substring(0, 100)));
} else {
  console.log("OK: Buscar y Preparar Modificacion fixed (now uses $('Retell Tool Call2'))");
}

// ---- FIX 3: Calcular Disponibilidad -> $('Retell Tool Call3') ----
const calcDisp = nodes.find(n => n.name === 'Calcular Disponibilidad');
const oldCalcCode = calcDisp.parameters.jsCode;

const oldCalcHeader = "// Parámetros recibidos de Retell\nconst raw = $('Retell Tool Call').first().json.body || $('Retell Tool Call').first().json;\n  let body;\n  if (raw.arguments !== undefined) {\n    body = typeof raw.arguments === 'string' ? JSON.parse(raw.arguments) : raw.arguments;\n  } else {\n    body = raw;\n  }";

const newCalcHeader = "// Parámetros recibidos de Retell\nconst webhookRaw = $('Retell Tool Call3').first().json.body || $('Retell Tool Call3').first().json;\nlet body;\nif (webhookRaw.arguments !== undefined) {\n  body = typeof webhookRaw.arguments === 'string' ? JSON.parse(webhookRaw.arguments) : webhookRaw.arguments;\n} else {\n  body = webhookRaw;\n}";

calcDisp.parameters.jsCode = oldCalcCode.replace(oldCalcHeader, newCalcHeader);

if (calcDisp.parameters.jsCode === oldCalcCode) {
  console.log('ERROR: Calcular Disponibilidad replacement did not match');
  console.log('Code starts with:', JSON.stringify(oldCalcCode.substring(0, 120)));
} else {
  console.log("OK: Calcular Disponibilidad fixed (now uses $('Retell Tool Call3'))");
}

// Also update variable name in Calcular Disponibilidad - replace 'raw.' with 'body.' references
// (no change needed since we renamed to webhookRaw and body is already correct)

// Verify Buscar Reserva is correct (should use $('Retell Tool Call') - which IS cancelar-reserva webhook)
const buscarRes = nodes.find(n => n.name === 'Buscar Reserva');
const buscarCode = buscarRes.parameters.jsCode;
if (buscarCode.includes("$('Retell Tool Call').first()") && !buscarCode.includes("$('Retell Tool Call')1") && !buscarCode.includes("$('Retell Tool Call2')")) {
  console.log("OK: Buscar Reserva already correct (uses $('Retell Tool Call') = cancelar-reserva webhook)");
}

// Save modified workflow
fs.writeFileSync('C:/Users/josem/Desktop/HAT3X/CLAUDE/HAT3X/wf_QTEkPUTUb4lLI6Tm_fixed.json', JSON.stringify(data, null, 2));
console.log('\nSaved fixed workflow to wf_QTEkPUTUb4lLI6Tm_fixed.json');
