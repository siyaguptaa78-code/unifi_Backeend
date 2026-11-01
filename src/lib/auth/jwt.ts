import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/lib/rbac";

export const SESSION_COOKIE = "uc_session";

export type SessionPayload = { sub: string; role: Role; tv: number; name: string };

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET must be at least 32 characters");
    return new TextEncoder().encode("dev-only-insecure-secret-change-me-0123456789");
  }
  return new TextEncoder().encode(s);
}

export function sessionTtlSeconds() {
  const h = Number(process.env.SESSION_TTL_HOURS || 12);
  return Math.max(1, h) * 3600;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role, tv: payload.tv, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer("unicafe")
    .setExpirationTime(`${sessionTtlSeconds()}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "unicafe" });
    if (!payload.sub) return null;
    return { sub: payload.sub, role: payload.role as Role, tv: Number(payload.tv ?? 0), name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: sessionTtlSeconds(),
  };
}

