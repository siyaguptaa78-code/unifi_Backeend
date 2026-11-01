import type { NextRequest } from "next/server";

export type Paging = { page: number; limit: number; skip: number };

export function paging(req: NextRequest, defLimit = 20): Paging {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || defLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function pageMeta(p: Paging, total: number) {
  return { page: p.page, limit: p.limit, total, totalPages: Math.max(1, Math.ceil(total / p.limit)) };
}

/** Escape user input for safe use inside a RegExp (prevents ReDoS / regex injection). */
export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function dateRange(req: NextRequest, field = "createdAt") {
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const q: Record<string, Date> = {};
  if (from && !isNaN(Date.parse(from))) q.$gte = new Date(from);
  if (to && !isNaN(Date.parse(to))) {
    const d = new Date(to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) d.setHours(23, 59, 59, 999);
    q.$lte = d;
  }
  return Object.keys(q).length ? { [field]: q } : {};
}

