const fs = require('fs');
const llm = JSON.parse(fs.readFileSync('./llm_current.json', 'utf8'));

const oldPrompt = llm.general_prompt;

// Remove hardcoded first paragraph, use {{currentDateTime}} dynamically
const newFirstParagraph = "Hoy es {{currentDateTime}} (hora de Madrid, zona horaria Europe/Madrid). El restaurante cierra los lunes. Cuando el cliente diga dias relativos como manana, esta semana, el viernes, el fin de semana o la proxima semana, calcula la fecha exacta a partir de {{currentDateTime}}. Siempre confirma en voz alta la fecha exacta con el cliente antes de consultar disponibilidad, por ejemplo: el viernes tres de abril, verdad?";

// Find where the Eres paragraph starts
const idx = oldPrompt.indexOf('\n\nEres');
if (idx > -1) {
  let newPrompt = newFirstParagraph + oldPrompt.substring(idx);
  
  // Clean up the FECHA Y HORA ACTUAL section
  newPrompt = newPrompt.replace(
    /## FECHA Y HORA ACTUAL\n[^\n]+\n/,
    "## FECHA Y HORA ACTUAL\nHoy es {{currentDateTime}} (hora de Madrid, zona horaria Europe/Madrid). Esta es tu referencia absoluta. SIEMPRE convierte expresiones relativas a formato YYYY-MM-DD antes de llamar a cualquier funcion. Nunca uses una fecha del pasado.\n"
  );
  
  console.log('Prompt updated. First 300 chars:');
  console.log(newPrompt.substring(0, 300));
  
  const updatePayload = {
    general_prompt: newPrompt,
    model: llm.model,
    general_tools: llm.general_tools,
    begin_message: llm.begin_message
  };
  
  fs.writeFileSync('./llm_update.json', JSON.stringify(updatePayload), 'utf8');
  console.log('Saved llm_update.json, size:', JSON.stringify(updatePayload).length);
} else {
  console.log('Pattern not found in prompt!');
}
