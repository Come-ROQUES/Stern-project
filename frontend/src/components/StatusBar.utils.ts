import type { SystemStatus } from "../lib/api";

export function resolveStatusBarGateway(
  system: SystemStatus | null | undefined
): boolean | null {
  if (!system) return null;
  if (system.gateway_connected === false) return false;
  if (system.gateway_connected === true) return true;
  if (system.health?.gateway_connected === false) return false;
  if (system.health?.gateway_connected === true) return true;
  if (system.service_checked === false) return null;
  if (system.bot_running === true) return true;
  return null;
}
