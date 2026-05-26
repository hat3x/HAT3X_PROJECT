import { InlineKeyboard } from "grammy"
import type { Context } from "grammy"
import { getSupabaseClient } from "../../database/client.js"
import { CommandCenter } from "../../command-center/index.js"
import {
  formatTaskList,
  formatPlanMessage,
  formatCheckpointAlert,
  formatCheckpointList,
} from "../notifications/formatters.js"
import type { ExecutionPlan, Subtask } from "../../types.js"
import type { HatCheckpoint } from "../../checkpoint/types.js"

function rowToCheckpoint(row: Record<string, unknown>): HatCheckpoint {
  return {
    id: row["id"] as string,
    taskId: row["task_id"] as string,
    afterPhase: row["after_phase"] as number,
    reason: row["reason"] as string,
    requiredApproval: row["required_approval"] as HatCheckpoint["requiredApproval"],
    status: row["status"] as HatCheckpoint["status"],
    feedback: (row["feedback"] as string | null) ?? null,
    triggeredAt: row["triggered_at"] as string,
    resolvedAt: (row["resolved_at"] as string | null) ?? null,
  }
}

export async function handleStatus(ctx: Context): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .from("hat3x_tasks")
    .select("id, order_raw, status, control_mode, created_at")
    .order("created_at", { ascending: false })
    .limit(5)

  if (error != null) {
    await ctx.reply("❌ Error al conectar con base de datos.")
    return
  }

  await ctx.reply(formatTaskList(data ?? []), { parse_mode: "Markdown" })
}

export async function handleNuevo(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ""
  const orden = text.replace(/^\/nuevo\s*/i, "").trim()

  if (!orden) {
    await ctx.reply("Uso: /nuevo <descripción de la tarea>")
    return
  }

  await ctx.reply("⏳ Creando tarea...")

  try {
    const task = await new CommandCenter().processOrder({
      orderRaw: orden,
      skipAnalysis: true,
    })

    await ctx.reply(
      `✅ Tarea creada: *${task.id}*\n📋 ${task.orderRaw}\n\nUsa /plan ${task.id} para ver el plan cuando esté listo.`,
      { parse_mode: "Markdown" }
    )
  } catch {
    await ctx.reply("❌ Error al crear tarea. Por favor, intenta de nuevo.")
  }
}

export async function handleCheckpoints(ctx: Context): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .from("hat3x_checkpoints")
    .select("*")
    .eq("status", "pending")
    .order("triggered_at", { ascending: true })

  if (error != null) {
    await ctx.reply("❌ Error al conectar con base de datos.")
    return
  }

  const checkpoints = (data ?? []).map((row) => rowToCheckpoint(row as Record<string, unknown>))

  if (checkpoints.length === 0) {
    await ctx.reply(formatCheckpointList([]), { parse_mode: "Markdown" })
    return
  }

  for (const cp of checkpoints) {
    const keyboard = new InlineKeyboard()
      .text("✅ Aprobar", `aprobar:${cp.id}`)
      .text("❌ Rechazar", `rechazar:${cp.id}`)

    await ctx.reply(formatCheckpointAlert(cp), {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    })
  }
}

export async function handlePlan(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ""
  const taskId = text.replace(/^\/plan\s*/i, "").trim()

  if (!taskId) {
    await ctx.reply("Uso: /plan <HAT3X-NNN>")
    return
  }

  const { data, error } = await getSupabaseClient()
    .from("hat3x_tasks")
    .select("id, order_raw, status, control_mode, subtasks, execution_plan")
    .eq("id", taskId)
    .single()

  if (error != null || data == null) {
    await ctx.reply(`❌ Tarea ${taskId} no encontrada.`)
    return
  }

  const row = data as {
    id: string
    order_raw: string
    status: string
    control_mode: string
    subtasks: Subtask[] | null
    execution_plan: ExecutionPlan | null
  }

  const message = formatPlanMessage(row.id, row.execution_plan, row.subtasks ?? [])
  await ctx.reply(message, { parse_mode: "Markdown" })
}

export async function handleAyuda(ctx: Context): Promise<void> {
  const help = [
    "*HAT3X Command — Comandos disponibles:*",
    "",
    "/status — Ver últimas 5 tareas",
    "/nuevo <orden> — Crear nueva tarea",
    "/plan <id> — Ver plan de ejecución",
    "/checkpoints — Ver checkpoints pendientes",
    "/aprobar <id> [feedback] — Aprobar checkpoint",
    "/rechazar <id> <motivo> — Rechazar checkpoint",
    "/ayuda — Este mensaje",
  ].join("\n")

  await ctx.reply(help, { parse_mode: "Markdown" })
}
