import type { Request, Response, NextFunction } from "express";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/jwt";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { AppError } from "@/lib/errors";
import type { Role } from "@/lib/rbac";
import type { AuthUser } from "@/lib/auth/session";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const cookieToken = req.cookies?.[SESSION_COOKIE] || req.cookies?.unicafe_session;
  const headerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7).trim()
    : undefined;
  const token = cookieToken || headerToken;

  if (!token) {
    return next();
  }

  try {
    const payload = await verifySession(token);
    if (!payload) return next();

    await connectDB();
    const user = await User.findById(payload.sub).lean();
    if (!user || user.status !== "ACTIVE" || (user.tokenVersion ?? 0) !== payload.tv) {
      return next();
    }

    req.user = {
      id: String(user._id),
      role: user.role as Role,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
    };
    next();
  } catch {
    next();
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "You do not have permission to access this resource" },
      });
    }
    next();
  };
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  console.error("Unhandled Backend Error:", err);
  return res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: err.message || "An unexpected server error occurred" },
  });
}
