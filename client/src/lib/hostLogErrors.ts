/**
 * Maps server host-log error reason codes to user-facing alert messages.
 */
const REASON_MESSAGES: Record<string, string> = {
  agent_unreachable: "Can't reach the log agent on this host.",
  agent_auth: "The log agent rejected ContainerYard's token.",
  agent_logs_off: "Logs are off on this host's agent.",
  agent_rate_limited: "The log agent rate-limited requests; try again shortly.",
  agent_error: "The log agent returned an unexpected response.",
  not_readable: "Log file is missing or not readable.",
  not_found: "Log source was not found on this host.",
  permission: "Permission denied to read this log source.",
  read_error: "Failed to read this log source.",
};

export function hostLogReasonMessage(reason: string | undefined, fallback?: string): string {
  if (reason && Object.prototype.hasOwnProperty.call(REASON_MESSAGES, reason)) {
    return REASON_MESSAGES[reason];
  }
  if (fallback && fallback.trim()) {
    return fallback;
  }
  return "Host logs are currently unavailable for this host.";
}
