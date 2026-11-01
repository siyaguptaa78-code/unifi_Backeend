import type { ClientSession, Types } from "mongoose";
import { Notification, NOTIFICATION_TYPES } from "../models/Notification";
import { User } from "../models/User";

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/* ------------------------------------------------------------------ */
/* Delivery provider adapters (email / SMS / WhatsApp)                 */
/* ------------------------------------------------------------------ */
export interface DeliveryProvider {
  name: string;
  send(to: string, subject: string, body: string): Promise<{ delivered: boolean; providerRef?: string }>;
}

class MockProvider implements DeliveryProvider {
  constructor(public name: string) {}
  async send(to: string, subject: string, body: string) {
    if (process.env.NODE_ENV !== "test") console.info(`[notify:${this.name}:mock] to=${to} subject="${subject}" body="${body.slice(0, 80)}"`);
    return { delivered: true, providerRef: `mock-${Date.now()}` };
  }
}

/** Resolve a provider by channel. Real providers (SES, Twilio, Gupshup, etc.) plug in here. */
export function getProvider(channel: "EMAIL" | "SMS" | "WHATSAPP"): DeliveryProvider {
  const configured = process.env[`${channel}_PROVIDER`] || "mock";
  switch (configured) {
    // case "ses": return new SesProvider(...)
    default:
      return new MockProvider(`${channel.toLowerCase()}`);
  }
}

const EXTERNAL_CHANNEL_TYPES: NotificationType[] = ["PAYMENT_CONFIRMATION", "REFUND_PROCESSED", "HOURS_EXHAUSTED", "ORDER_READY"];

/**
 * Create an in-app notification. For important types also dispatch to external channels
 * (mock in development). External delivery is fire-and-forget and never blocks the caller.
 */
export async function notify(
  userId: string | Types.ObjectId,
  type: NotificationType,
  title: string,
  message: string,
  opts: { link?: string; session?: ClientSession; isDemo?: boolean } = {}
) {
  const channels = ["IN_APP", ...(EXTERNAL_CHANNEL_TYPES.includes(type) ? ["EMAIL", "SMS"] : [])];
  const [doc] = await Notification.create(
    [{ user: userId, type, title, message, link: opts.link, channels, isDemo: opts.isDemo ?? false }],
    opts.session ? { session: opts.session } : {}
  );
  if (channels.length > 1) {
    void (async () => {
      try {
        const u = await User.findById(userId).lean();
        if (!u) return;
        await getProvider("EMAIL").send(u.email, title, message);
        await getProvider("SMS").send(u.mobile, title, message);
      } catch (e) {
        console.error("[notify] external delivery failed", e);
      }
    })();
  }
  return doc;
}

