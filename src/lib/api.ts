import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodSchema, type z } from "zod";
import mongoose from "mongoose";
import { AppError, Errors } from "./errors";
import { connectDB } from "./db";
import { getSessionUser, type AuthUser } from "./auth/session";
import { hasPermission, type Permission, type Role } from "./rbac";
import { rateLimit } from "./rate-limit";

export type ApiSuccess<T> = { success: true; data: T; meta?: Record<string, unknown> };
export type ApiFailure = { success: false; error: { code: string; message: string; details?: unknown } };

export function ok<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data, ...(meta ? { meta } : {}) }, { status });
}

export function fail(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json<ApiFailure>(
      { success: false, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } },
      { status: err.status }
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json<ApiFailure>(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Validation failed", details: err.flatten() } },
      { status: 422 }
    );
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return NextResponse.json<ApiFailure>(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid data", details: Object.keys(err.errors) } },
      { status: 422 }
    );
  }
  if (err instanceof mongoose.Error.CastError) {
    return NextResponse.json<ApiFailure>({ success: false, error: { code: "BAD_REQUEST", message: "Invalid identifier" } }, { status: 400 });
  }
  if (typeof err === "object" && err && (err as { code?: number }).code === 11000) {
    const keys = Object.keys((err as { keyPattern?: object }).keyPattern ?? {});
    return NextResponse.json<ApiFailure>(
      { success: false, error: { code: "DUPLICATE", message: `A record with this ${keys.join(", ") || "value"} already exists` } },
      { status: 409 }
    );
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json<ApiFailure>(
    { success: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
    { status: 500 }
  );
}

export type ApiCtx<P = Record<string, string>> = {
  req: NextRequest;
  user: AuthUser;
  params: P;
  ip: string;
};

type Options = {
  /** Allowed roles. If omitted and `public` is not set, any authenticated user is allowed. */
  roles?: Role[];
  permission?: Permission;
  rateLimit?: { name: string; limit: number; windowMs: number };
};

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Authenticated route wrapper: connects DB, authenticates, authorizes, rate limits and normalises errors. */
export function route<P = Record<string, string>>(handler: (ctx: ApiCtx<P>) => Promise<Response>, opts: Options = {}) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      const ip = clientIp(req);
      if (opts.rateLimit) {
        const r = rateLimit(`${opts.rateLimit.name}:${ip}`, opts.rateLimit.limit, opts.rateLimit.windowMs);
        if (!r.allowed) throw Errors.tooMany();
      }
      await connectDB();
      const user = await getSessionUser();
      if (!user) throw Errors.unauthorized();
      if (opts.roles && !opts.roles.includes(user.role)) throw Errors.forbidden();
      if (opts.permission && !hasPermission(user.role, opts.permission)) throw Errors.forbidden();
      const params = (context?.params ? await context.params : {}) as P;
      return await handler({ req, user, params, ip });
    } catch (err) {
      return fail(err);
    }
  };
}

/** Public route wrapper (no auth), still with DB, rate limiting and error handling. */
export function publicRoute<P = Record<string, string>>(
  handler: (ctx: { req: NextRequest; params: P; ip: string }) => Promise<Response>,
  opts: Pick<Options, "rateLimit"> = {}
) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      const ip = clientIp(req);
      if (opts.rateLimit) {
        const r = rateLimit(`${opts.rateLimit.name}:${ip}`, opts.rateLimit.limit, opts.rateLimit.windowMs);
        if (!r.allowed) throw Errors.tooMany();
      }
      await connectDB();
      const params = (context?.params ? await context.params : {}) as P;
      return await handler({ req, params, ip });
    } catch (err) {
      return fail(err);
    }
  };
}

export async function parseBody<S extends ZodSchema>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw Errors.badRequest("Request body must be valid JSON");
  }
  const result = schema.safeParse(json);
  if (!result.success) throw Errors.validation(result.error.flatten());
  return result.data;
}

export function parseQuery<S extends ZodSchema>(req: NextRequest, schema: S): z.infer<S> {
  const obj = Object.fromEntries(req.nextUrl.searchParams.entries());
  const result = schema.safeParse(obj);
  if (!result.success) throw Errors.validation(result.error.flatten());
  return result.data;
}

export function assertObjectId(id: string, what = "Resource") {
  if (!mongoose.isValidObjectId(id)) throw Errors.notFound(what);
  return new mongoose.Types.ObjectId(id);
}

