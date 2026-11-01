import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { CustomerProfile } from "../models/CustomerProfile";
import { Membership } from "../models/Membership";
import { Errors } from "../lib/errors";
import { withTransaction } from "../lib/db";
import { randomDigits, randomHex, sha256 } from "../lib/ids";
import { getProvider } from "./notification.service";
import { logAudit } from "./audit.service";
import type { z } from "zod";
import type { registerSchema } from "../lib/validators";
import type { Role } from "../lib/rbac";

const BCRYPT_ROUNDS = 10;
let DUMMY_HASH: string | undefined;

export const hashPassword = (pw: string) => bcrypt.hash(pw, BCRYPT_ROUNDS);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function generateCustomerCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = `UC${randomDigits(6)}`;
    if (!(await CustomerProfile.exists({ customerCode: code }))) return code;
  }
  throw new Error("Could not generate unique customer code");
}

export async function registerCustomer(input: z.infer<typeof registerSchema>) {
  const email = input.email.toLowerCase();
  const [emailTaken, mobileTaken] = await Promise.all([User.exists({ email }), User.exists({ mobile: input.mobile })]);
  if (emailTaken) throw Errors.conflict("An account with this email already exists", { field: "email" });
  if (mobileTaken) throw Errors.conflict("An account with this mobile number already exists", { field: "mobile" });

  const passwordHash = await hashPassword(input.password);
  const customerCode = await generateCustomerCode();

  return withTransaction(async (session) => {
    const opts = session ? { session } : {};
    const [user] = await User.create([{ name: input.name, email, mobile: input.mobile, passwordHash, role: "CUSTOMER" }], opts);
    await CustomerProfile.create([{ user: user._id, customerCode }], opts);
    // Membership record is created INACTIVE; it becomes ACTIVE on first verified payment.
    await Membership.create([{ customer: user._id, status: "INACTIVE" }], opts);
    return { id: String(user._id), role: user.role as Role, name: user.name, email: user.email, tokenVersion: user.tokenVersion ?? 0 };
  });
}

export async function authenticate(identifier: string, password: string) {
  const id = identifier.trim().toLowerCase();
  const query = /^[6-9]\d{9}$/.test(id) ? { mobile: id } : { email: id };
  const user = await User.findOne(query).select("+passwordHash");
  // Constant-ish time: always run a bcrypt compare to avoid user enumeration through timing.
  const hash = user?.passwordHash ?? (DUMMY_HASH ??= bcrypt.hashSync("unicafe-dummy-password", BCRYPT_ROUNDS));
  const valid = await verifyPassword(password, hash);
  if (!user || !valid) throw Errors.unauthorized("Invalid email/mobile or password");
  if (user.status !== "ACTIVE") throw Errors.forbidden("Your account is suspended. Please contact support.");
  user.lastLoginAt = new Date();
  await user.save();
  return { id: String(user._id), role: user.role as Role, name: user.name, email: user.email, tokenVersion: user.tokenVersion ?? 0 };
}

/**
 * Creates a password reset token (stored hashed, 30 min expiry) and delivers it through the
 * configured email provider. In non-production mock mode the link is also returned so the
 * flow can be demonstrated without an email provider.
 */
export async function requestPasswordReset(identifier: string) {
  const id = identifier.trim().toLowerCase();
  const query = /^[6-9]\d{9}$/.test(id) ? { mobile: id } : { email: id };
  const user = await User.findOne(query);
  if (!user || user.status !== "ACTIVE") return { devResetUrl: null };
  const token = randomHex(32).toLowerCase();
  await User.updateOne({ _id: user._id }, { resetTokenHash: sha256(token), resetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000) });
  const url = `${process.env.APP_URL || "http://localhost:3000"}/reset-password?token=${token}`;
  await getProvider("EMAIL").send(user.email, "Reset your UniCafe password", `Reset your password: ${url} (valid for 30 minutes)`);
  await logAudit({ id: String(user._id), role: user.role as Role, name: user.name, email: user.email, mobile: user.mobile }, "AUTH_RESET_REQUESTED", "User", user._id);
  const isMock = (process.env.EMAIL_PROVIDER || "mock") === "mock";
  return { devResetUrl: isMock && process.env.NODE_ENV !== "production" ? url : null };
}

export async function resetPassword(token: string, password: string) {
  const user = await User.findOne({ resetTokenHash: sha256(token), resetTokenExpiresAt: { $gt: new Date() } }).select("+resetTokenHash");
  if (!user) throw Errors.badRequest("This reset link is invalid or has expired");
  await User.updateOne(
    { _id: user._id },
    { passwordHash: await hashPassword(password), $unset: { resetTokenHash: 1, resetTokenExpiresAt: 1 }, $inc: { tokenVersion: 1 } }
  );
  await logAudit({ id: String(user._id), role: user.role as Role, name: user.name, email: user.email, mobile: user.mobile }, "AUTH_PASSWORD_RESET", "User", user._id);
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await User.findById(userId).select("+passwordHash");
  if (!user) throw Errors.notFound("User");
  if (!(await verifyPassword(current, user.passwordHash))) throw Errors.badRequest("Current password is incorrect");
  user.passwordHash = await hashPassword(next);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  return user.tokenVersion;
}
