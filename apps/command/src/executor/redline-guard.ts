export interface AgentSettings {
  permissions: { deny: string[] }
}

export function buildAgentSettings(_workspaceDir: string): AgentSettings {
  return {
    permissions: {
      deny: [
        "Bash(vercel*)",
        "Bash(npx vercel*)",
        "Bash(netlify*)",
        "Bash(git push*)",
        "Bash(gh release*)",
        "WebFetch",
      ],
    },
  }
}

export const REDLINE_INSTRUCTIONS = [
  "LÍNEAS ROJAS (prohibido ejecutarlas tú mismo):",
  "- Deploy a producción (vercel, netlify, git push, releases).",
  "- Enviar comunicaciones a clientes (email, WhatsApp, Telegram).",
  "- Acciones irreversibles o que gasten dinero.",
  "- Escribir fuera de tu carpeta de trabajo.",
  "Si tu tarea REQUIERE cruzar una línea roja, NO lo hagas: termina tu trabajo hasta ese punto",
  "y responde en tu última línea exactamente: HAT3X_CHECKPOINT: <qué necesitas y por qué>",
].join("\n")
