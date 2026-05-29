import type { ControlMode, ClientMemory } from "../types.js"

interface ResolveControlModeInput {
  explicitMode: ControlMode | null
  clientMemory: ClientMemory | null
  orderRaw: string
}

export function resolveControlMode(input: ResolveControlModeInput): ControlMode {
  if (input.explicitMode) return input.explicitMode
  if (!input.clientMemory || input.clientMemory.previousProjects.length === 0) return "supervised"
  return "phased"
}
