import { evaluateToolPolicy, type ToolPolicyInput, type ToolPolicyResult } from './policy-engine';

export type ToolRoute = 'aiden' | 'aiden_prepare' | 'approval' | 'command';

export interface ToolRouteResult extends ToolPolicyResult {
  route: ToolRoute;
}

export function routeToolRequest(toolName: string, input: ToolPolicyInput = {}): ToolRouteResult {
  const policy = evaluateToolPolicy(toolName, input);

  const routeByDecision: Record<ToolPolicyResult['decision'], ToolRoute> = {
    execute: 'aiden',
    prepare: 'aiden_prepare',
    require_approval: 'approval',
    delegate_to_command: 'command',
  };

  return {
    ...policy,
    route: routeByDecision[policy.decision],
  };
}
