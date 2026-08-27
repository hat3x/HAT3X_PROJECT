import { config } from "dotenv"
config({ path: ".env" })
config({ path: "../../.env" })

// Tests deterministas: el cerebro usa el mock de OpenAI, nunca spawn de claude real
process.env["COMMAND_BRAIN"] = "openai"
// Y el staffing LLM (llamada real a OpenAI) queda desactivado: usa heurística
process.env["COMMAND_DISABLE_STAFFING_LLM"] = "1"

// Las pruebas no dependen del .env de nadie.
//
// Antes daban por hecho que existia un .env con credenciales reales de Supabase:
// en local pasaban y en CI —donde no hay .env— fallaban tres. El fallo estuvo
// escondido mientras el CI no se disparaba sobre las ramas de trabajo.
//
// Si la variable ya viene del entorno se respeta; si no, un valor ficticio que
// solo sirve para construir el cliente. Ninguna prueba habla con Supabase de
// verdad: las que lo necesitan inyectan sus dobles.
process.env["SUPABASE_URL"] ??= "https://pruebas.supabase.invalid"
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "clave-de-pruebas-no-es-real"
