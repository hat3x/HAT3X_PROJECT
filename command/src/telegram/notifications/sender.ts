import { InlineKeyboard, type Bot } from "grammy"
import { formatCheckpointAlert } from "./formatters.js"
import type { HatCheckpoint } from "../../checkpoint/types.js"

export class NotificationSender {
  constructor(private readonly bot: Bot) {}

  private getChatId(): number {
    const raw = process.env["TELEGRAM_JOSE_CHAT_ID"]
    if (raw == null) throw new Error("TELEGRAM_JOSE_CHAT_ID is not set")
    return Number(raw)
  }

  async sendCheckpointAlert(checkpoint: HatCheckpoint): Promise<void> {
    const chatId = this.getChatId()
    const text = formatCheckpointAlert(checkpoint)
    const keyboard = new InlineKeyboard()
      .text("✅ Aprobar", `aprobar:${checkpoint.id}`)
      .text("❌ Rechazar", `rechazar:${checkpoint.id}`)

    await this.bot.api.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  }

  async sendTaskCompleted(taskId: string, summary: string): Promise<void> {
    const chatId = this.getChatId()
    const text = `✅ *Tarea completada: ${taskId}*\n${summary}`
    await this.bot.api.sendMessage(chatId, text, { parse_mode: "Markdown" })
  }

  async sendAgentBlocked(
    taskId: string,
    agentId: string,
    reason: string
  ): Promise<void> {
    const chatId = this.getChatId()
    const text = [
      `⚠️ *Agente bloqueado — ${taskId}*`,
      `Agente: \`${agentId}\``,
      `Motivo: ${reason}`,
      "",
      `Revisa con /plan ${taskId}`,
    ].join("\n")
    await this.bot.api.sendMessage(chatId, text, { parse_mode: "Markdown" })
  }
}
