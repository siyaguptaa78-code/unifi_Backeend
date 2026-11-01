import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import type { Role } from "@/lib/rbac";

export type AuthUser = { id: string; role: Role; name: string; email: string; mobile: string };

/**
 * Resolves the authenticated user from the HTTP-only session cookie and re-validates against
 * the database (status + tokenVersion) so suspended users / logged-out sessions are rejected
 * immediately even if their JWT has not expired.
 */
export async function getSessionUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const payload = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  await connectDB();
  const user = await User.findById(payload.sub).lean();
  if (!user || user.status !== "ACTIVE" || (user.tokenVersion ?? 0) !== payload.tv) return null;
  return { id: String(user._id), role: user.role as Role, name: user.name, email: user.email, mobile: user.mobile };
}

