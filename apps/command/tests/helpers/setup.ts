import { config } from "dotenv"
config({ path: ".env" })
config({ path: "../../.env" })

// Tests deterministas: el cerebro usa el mock de OpenAI, nunca spawn de claude real
process.env["COMMAND_BRAIN"] = "openai"
// Y el staffing LLM (llamada real a OpenAI) queda desactivado: usa heurística
process.env["COMMAND_DISABLE_STAFFING_LLM"] = "1"
