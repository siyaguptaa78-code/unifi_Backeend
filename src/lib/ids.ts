import { randomBytes, randomInt, createHash } from "crypto";

export function randomDigits(n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += randomInt(0, 10).toString();
  return s;
}

export function randomHex(bytes: number) {
  return randomBytes(bytes).toString("hex").toUpperCase();
}

export function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

/** Human-friendly unique reference, e.g. ORD-20261031-4821-K9 */
export function makeReference(prefix: string) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${prefix}-${ymd}-${randomDigits(4)}${randomBytes(1).toString("hex").toUpperCase()}`;
}

