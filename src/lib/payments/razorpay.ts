import { createHmac, timingSafeEqual } from "crypto";

/**
 * Thin Razorpay REST adapter (no SDK dependency). Only used when PAYMENT_MODE=razorpay and
 * keys are configured. Signature helpers are pure and unit-tested.
 */
export function razorpayConfigured() {
  return (
    (process.env.PAYMENT_MODE || "demo") === "razorpay" && Boolean(process.env.RAZORPAY_KEY_ID) && Boolean(process.env.RAZORPAY_KEY_SECRET)
  );
}

function authHeader() {
  const token = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  return `Basic ${token}`;
}

export async function razorpayCreateOrder(amountInr: number, receipt: string, notes: Record<string, string>) {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({ amount: Math.round(amountInr * 100), currency: "INR", receipt, notes }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[razorpay] order create failed", res.status, text);
    throw new Error("Unable to create payment order with Razorpay");
  }
  return (await res.json()) as { id: string; amount: number; currency: string; receipt: string; status: string };
}

export async function razorpayRefund(paymentId: string, amountInr: number) {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({ amount: Math.round(amountInr * 100) }),
  });
  if (!res.ok) throw new Error(`Razorpay refund failed (${res.status})`);
  return (await res.json()) as { id: string; status: string };
}

function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret) */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, secret = process.env.RAZORPAY_KEY_SECRET || "") {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC_SHA256(raw_body, webhook_secret) */
export function verifyWebhookSignature(rawBody: string, signature: string, secret = process.env.RAZORPAY_WEBHOOK_SECRET || "") {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

