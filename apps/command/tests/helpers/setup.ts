import { config } from "dotenv"
config({ path: ".env" })
config({ path: "../../.env" })

// Tests deterministas: el cerebro usa el mock de OpenAI, nunca spawn de claude real
process.env["COMMAND_BRAIN"] = "openai"
