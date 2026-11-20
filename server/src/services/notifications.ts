/**
 * Notification delivery shared by the alert worker and the alerts routes.
 * (Previously duplicated in both files, with an unguarded fetch() to the
 * user-supplied webhook URL.)
 */
import { log } from "../../vite";
import { postWebhook } from "../lib/safeWebhook";

export interface ChannelLike {
  id: number | string;
  type: string;
  config: string;
}

/** Channel config as stored (JSON). Every field is optional and checked before use. */
interface ChannelConfig {
  url?: unknown;
  payload?: unknown;
  headers?: unknown;
  to?: unknown;
  subject?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseConfig(channel: ChannelLike): ChannelConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(channel.config);
  } catch {
    throw new Error(`Invalid JSON in notification channel config for channel ${channel.id}`);
  }
  return isRecord(parsed) ? parsed : {};
}

function stringHeaders(v: unknown): Record<string, string> {
  if (!isRecord(v)) return {};
  return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, String(val)]));
}

async function sendWebhookNotification(config: ChannelConfig, message: string): Promise<void> {
  const { status } = await postWebhook(
    typeof config.url === "string" ? config.url : "",
    {
      text: message,
      message,
      timestamp: new Date().toISOString(),
      ...(isRecord(config.payload) ? config.payload : {}),
    },
    stringHeaders(config.headers),
  );
  if (status < 200 || status >= 300) {
    throw new Error(
      status >= 300 && status < 400
        ? `Webhook returned redirect ${status}; redirects are not followed`
        : `Webhook failed with status ${status}`,
    );
  }
}

async function sendEmailNotification(config: ChannelConfig, message: string): Promise<void> {
  // Email delivery is not implemented yet; messages are logged.
  log(`[EMAIL] To: ${String(config.to)}`, "info");
  log(`[EMAIL] Subject: ${typeof config.subject === "string" && config.subject ? config.subject : "ContainerYard Alert"}`, "info");
  log(`[EMAIL] Body: ${message}`, "info");
}

async function sendBrowserNotification(_config: ChannelConfig, message: string): Promise<void> {
  log(`[BROWSER] ${message}`, "info");
}

export async function sendNotification(channel: ChannelLike, message: string): Promise<void> {
  const config = parseConfig(channel);
  switch (channel.type) {
    case "webhook":
      return sendWebhookNotification(config, message);
    case "email":
      return sendEmailNotification(config, message);
    case "browser":
      return sendBrowserNotification(config, message);
    default:
      throw new Error(`Unsupported notification type: ${channel.type}`);
  }
}
