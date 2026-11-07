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

function parseConfig(channel: ChannelLike): any {
  try {
    return JSON.parse(channel.config);
  } catch {
    throw new Error(`Invalid JSON in notification channel config for channel ${channel.id}`);
  }
}

async function sendWebhookNotification(config: any, message: string): Promise<void> {
  const { status } = await postWebhook(
    config.url,
    {
      text: message,
      message,
      timestamp: new Date().toISOString(),
      ...(config.payload && typeof config.payload === "object" ? config.payload : {}),
    },
    config.headers && typeof config.headers === "object" ? config.headers : {},
  );
  if (status < 200 || status >= 300) {
    throw new Error(
      status >= 300 && status < 400
        ? `Webhook returned redirect ${status}; redirects are not followed`
        : `Webhook failed with status ${status}`,
    );
  }
}

async function sendEmailNotification(config: any, message: string): Promise<void> {
  // Email delivery is not implemented yet; messages are logged.
  log(`[EMAIL] To: ${config.to}`, "info");
  log(`[EMAIL] Subject: ${config.subject || "ContainerYard Alert"}`, "info");
  log(`[EMAIL] Body: ${message}`, "info");
}

async function sendBrowserNotification(_config: any, message: string): Promise<void> {
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
