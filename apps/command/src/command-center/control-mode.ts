import type { ControlMode, ClientMemory } from "../types.js"

export interface ResolveControlModeInput {
  explicitMode: ControlMode | null
  clientMemory: ClientMemory | null
  orderRaw: string
}

export function resolveControlMode(input: ResolveControlModeInput): ControlMode {
  if (input.explicitMode != null) return input.explicitMode
  if (input.clientMemory == null || input.clientMemory.previousProjects.length === 0) return "supervised"
  return "phased"
}
