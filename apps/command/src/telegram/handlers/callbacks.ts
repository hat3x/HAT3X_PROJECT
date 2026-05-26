import type { Context } from "grammy"
import { resolveCheckpoint } from "../../checkpoint/factory.js"

export async function handleApproveCallback(
  ctx: Context,
  checkpointId: string
): Promise<void> {
  await resolveCheckpoint(checkpointId, "approved", "Aprobado via Telegram")
  await ctx.answerCallbackQuery({ text: `✅ Checkpoint ${checkpointId} aprobado` })
  await ctx.editMessageText(`✅ *${checkpointId}* aprobado.`, { parse_mode: "Markdown" })
}

export async function handleRejectCallback(
  ctx: Context,
  checkpointId: string
): Promise<void> {
  await resolveCheckpoint(checkpointId, "rejected", "Rechazado via Telegram")
  await ctx.answerCallbackQuery({ text: `❌ Checkpoint ${checkpointId} rechazado` })
  await ctx.editMessageText(`❌ *${checkpointId}* rechazado.`, { parse_mode: "Markdown" })
}

export async function handleAprobarCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ""
  const parts = text.replace(/^\/aprobar\s*/i, "").trim().split(/\s+/)
  const checkpointId = parts[0] ?? ""
  const feedback = parts.slice(1).join(" ") || "Aprobado"

  if (!checkpointId || !checkpointId.startsWith("CHK-")) {
    await ctx.reply("Uso: /aprobar <CHK-NNN> [feedback opcional]")
    return
  }

  await resolveCheckpoint(checkpointId, "approved", feedback)
  await ctx.reply(`✅ Checkpoint *${checkpointId}* aprobado.`, { parse_mode: "Markdown" })
}

export async function handleRechazarCommand(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ""
  const parts = text.replace(/^\/rechazar\s*/i, "").trim().split(/\s+/)
  const checkpointId = parts[0] ?? ""
  const motivo = parts.slice(1).join(" ")

  if (!checkpointId || !checkpointId.startsWith("CHK-") || !motivo) {
    await ctx.reply("Uso: /rechazar <CHK-NNN> <motivo>")
    return
  }

  await resolveCheckpoint(checkpointId, "rejected", motivo)
  await ctx.reply(`❌ Checkpoint *${checkpointId}* rechazado.`, { parse_mode: "Markdown" })
}
